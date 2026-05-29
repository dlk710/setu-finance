import { google } from "googleapis";
import { authorizeGmail, getGmailIntegrationStatus } from "./gmailAuth.js";
import { matchPaymentToState } from "./matching.js";

function decodeBase64Url(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenPayload(payload) {
  if (!payload) {
    return [];
  }

  const nodes = [payload];
  const parts = [];
  while (nodes.length) {
    const node = nodes.shift();
    parts.push(node);
    if (node.parts?.length) {
      nodes.push(...node.parts);
    }
  }
  return parts;
}

function extractBodyText(message) {
  const parts = flattenPayload(message.payload);
  const plain = parts
    .filter((part) => part.mimeType === "text/plain" && part.body?.data)
    .map((part) => decodeBase64Url(part.body.data))
    .join("\n");

  if (plain.trim()) {
    return plain.trim();
  }

  const html = parts
    .filter((part) => part.mimeType === "text/html" && part.body?.data)
    .map((part) => stripHtml(decodeBase64Url(part.body.data)))
    .join("\n");

  if (html.trim()) {
    return html.trim();
  }

  if (message.payload?.body?.data) {
    return stripHtml(decodeBase64Url(message.payload.body.data));
  }

  return message.snippet || "";
}

function getHeader(message, headerName) {
  const header = message.payload?.headers?.find(
    (item) => item.name?.toLowerCase() === headerName.toLowerCase(),
  );
  return header?.value ?? "";
}

function extractAmount(text) {
  const preferredPatterns = [
    /(?:sent|payment|paid|amount)[^$]{0,40}\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i,
    /\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/,
  ];

  for (const pattern of preferredPatterns) {
    const match = text.match(pattern);
    if (match) {
      return Number(match[1].replaceAll(",", ""));
    }
  }

  return null;
}

function cleanSenderName(value) {
  return String(value || "")
    .replace(/["<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSenderName(text) {
  const patterns = [
    /payment from\s+([A-Za-z][A-Za-z.' -]{1,80})/i,
    /([A-Za-z][A-Za-z.' -]{1,80})\s+sent you/i,
    /from\s+([A-Za-z][A-Za-z.' -]{1,80})\s+(?:for|paid|sent|\$)/i,
    /sender(?:'s)?\s+name[:\s]+([A-Za-z][A-Za-z.' -]{1,80})/i,
    /payer[:\s]+([A-Za-z][A-Za-z.' -]{1,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return cleanSenderName(match[1]);
    }
  }

  return "";
}

function extractSenderEmail(text) {
  const match = text.match(/[A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function extractSenderPhoneLast4(text) {
  const patterns = [
    /(?:phone|mobile|cell|ending in|ending with)[^0-9]{0,20}(\d{4})/i,
    /[•*xX]{2,}\D{0,4}(\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseZelleLikeMessage(message) {
  const subject = getHeader(message, "Subject");
  const bodyText = extractBodyText(message);
  const joinedText = [subject, bodyText, message.snippet].filter(Boolean).join("\n");
  const receivedAt = getHeader(message, "Date") || new Date(Number(message.internalDate)).toISOString();

  return {
    sourceMessageId: message.id,
    subject,
    receivedAt,
    dateLabel: formatDateLabel(receivedAt),
    senderNameRaw: extractSenderName(joinedText),
    senderEmail: extractSenderEmail(joinedText),
    senderPhoneLast4: extractSenderPhoneLast4(joinedText),
    amountReceived: extractAmount(joinedText),
    rawText: joinedText,
  };
}

function buildSyncMessage(summary) {
  if (!summary.processedCount) {
    return "No new Zelle-like confirmations were found in the inbox.";
  }

  const pieces = [`Processed ${summary.processedCount} message${summary.processedCount === 1 ? "" : "s"}`];
  if (summary.pendingAdded) {
    pieces.push(`${summary.pendingAdded} queued for confirmation`);
  }
  if (summary.exceptionsAdded) {
    pieces.push(`${summary.exceptionsAdded} routed to exceptions`);
  }
  return pieces.join(" · ");
}

export async function syncGmailInbox(state) {
  const auth = await authorizeGmail();
  const gmail = google.gmail({ version: "v1", auth });
  const query =
    process.env.GMAIL_QUERY?.trim() ||
    '(zelle OR "sent you money" OR "payment from" OR "paid you") newer_than:14d';
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS || 20);

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = listResponse.data.messages ?? [];
  const newMessages = messages.filter(
    (message) => !state.processedMessageIds.includes(message.id),
  );

  const summary = {
    processedCount: 0,
    pendingAdded: 0,
    exceptionsAdded: 0,
  };
  const processedMessageIds = [];
  const paymentsToInsert = [];
  const exceptionsToInsert = [];

  for (const messageMeta of newMessages) {
    const messageResponse = await gmail.users.messages.get({
      userId: "me",
      id: messageMeta.id,
      format: "full",
    });

    const parsedPayment = parseZelleLikeMessage(messageResponse.data);
    processedMessageIds.push(messageMeta.id);
    summary.processedCount += 1;

    if (!parsedPayment.amountReceived || !parsedPayment.senderNameRaw) {
      exceptionsToInsert.push({
        id: `exc-${messageMeta.id}`,
        kind: "unmatched",
        senderName: parsedPayment.senderNameRaw || parsedPayment.subject || "Unknown sender",
        amount: parsedPayment.amountReceived || 0,
        dateLabel: parsedPayment.dateLabel,
        senderEmail: parsedPayment.senderEmail,
        senderPhoneLast4: parsedPayment.senderPhoneLast4,
        summary: "The inbox parser could not confidently extract a sender and amount from this message",
        sourceMessageId: parsedPayment.sourceMessageId,
      });
      summary.exceptionsAdded += 1;
      continue;
    }

    const matchResult = matchPaymentToState(parsedPayment, state);

    if (matchResult.kind === "pending") {
      paymentsToInsert.push({
        ...matchResult.payment,
        subject: parsedPayment.subject,
        dateLabel: parsedPayment.dateLabel,
        rawText: parsedPayment.rawText,
        reviewStatus: "pending",
      });
      summary.pendingAdded += 1;
      continue;
    }

    paymentsToInsert.push({
      id: `pay-${parsedPayment.sourceMessageId || crypto.randomUUID()}`,
      customerId: null,
      customerName: null,
      matchedSignals: [],
      score: 0,
      amountReceived: parsedPayment.amountReceived || 0,
      invoiceId: null,
      sourceMessageId: parsedPayment.sourceMessageId,
      senderEmail: parsedPayment.senderEmail,
      senderPhoneLast4: parsedPayment.senderPhoneLast4,
      senderNameRaw: parsedPayment.senderNameRaw,
      subject: parsedPayment.subject,
      dateLabel: parsedPayment.dateLabel,
      rawText: parsedPayment.rawText,
      receivedAt: parsedPayment.receivedAt,
      reviewStatus: "exception",
    });
    exceptionsToInsert.push({
      id: `exc-${messageMeta.id}`,
      ...matchResult.exception,
    });
    summary.exceptionsAdded += 1;
  }

  const syncedAt = new Date().toISOString();

  return {
    processedMessageIds,
    paymentsToInsert,
    exceptionsToInsert,
    syncedAt,
    summary,
    message: buildSyncMessage(summary),
  };
}

export function buildGmailClientStatus(state) {
  const base = getGmailIntegrationStatus();
  return {
    ...base,
    lastSyncAt: state.integrations?.gmail?.lastSyncAt ?? null,
    lastSyncSummary: state.integrations?.gmail?.lastSyncSummary ?? null,
  };
}
