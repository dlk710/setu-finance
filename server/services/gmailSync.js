import { google } from "googleapis";
import {
  authorizeGmail,
  createGmailReauthorizationError,
  getGmailIntegrationStatus,
  isGmailInvalidGrantError,
} from "./gmailAuth.js";
import { matchPaymentToState } from "./matching.js";

const DEFAULT_GMAIL_QUERY = '(zelle OR "sent you money" OR "payment from" OR "paid you")';
const DEFAULT_INITIAL_LOOKBACK_DAYS = 14;
const DEFAULT_SYNC_OVERLAP_MINUTES = 15;

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

function parseAddressHeader(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { name: null, email: null };
  }

  const emailMatch = raw.match(/[A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : null;
  const name = cleanSenderName(raw.replace(emailMatch?.[0] ?? "", "")) || null;
  return { name, email };
}

function extractAmount(text) {
  const amountToken = "([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)";
  const preferredPatterns = [
    new RegExp(`(?:sent|payment|paid|amount)[^$]{0,40}\\$${amountToken}`, "i"),
    new RegExp(`\\$${amountToken}`),
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
  const patterns = [
    /sender(?:'s)?\s+email[:\s]+([A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    /payer(?:'s)?\s+email[:\s]+([A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
    /registered\s+email[:\s]+([A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] ?? match[0];
    }
  }

  return null;
}

function formatIsoDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function extractTransactionDate(text) {
  const patterns = [
    /sent on[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
    /payment date[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
    /date[:\s]+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const parsed = formatIsoDateOnly(match[1]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
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

function extractTransactionReference(text) {
  const patterns = [
    /(?:transaction|confirmation|reference)\s*(?:number|id|#)?[:\s#-]+([A-Z0-9-]{6,40})/i,
    /(?:trace|payment)\s*(?:number|id|#)?[:\s#-]+([A-Z0-9-]{6,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractMemo(text) {
  const patterns = [
    /memo[:\s-]+([^\n\r]{2,120})/i,
    /for[:\s-]+([^\n\r]{2,120})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return String(match[1]).trim();
    }
  }

  return null;
}

export function parseZelleLikeMessage(message) {
  const subject = getHeader(message, "Subject");
  const bodyText = extractBodyText(message);
  const joinedText = [subject, bodyText, message.snippet].filter(Boolean).join("\n");
  const messageDateHeader = getHeader(message, "Date");
  const receivedAt = messageDateHeader || new Date(Number(message.internalDate)).toISOString();
  const messageFrom = parseAddressHeader(getHeader(message, "From"));
  const messageTo = parseAddressHeader(getHeader(message, "To"));
  const senderNameRaw = extractSenderName(joinedText);
  const senderEmail = extractSenderEmail(joinedText);
  const transactionDate = extractTransactionDate(joinedText);
  const transactionReference = extractTransactionReference(joinedText);
  const memo = extractMemo(joinedText);

  return {
    sourceMessageId: message.id,
    sourceProvider: "gmail",
    sourceThreadId: message.threadId ?? null,
    subject,
    receivedAt,
    messageFromEmail: messageFrom.email,
    messageToEmail: messageTo.email,
    messageDateHeader,
    transactionDate,
    dateLabel: formatDateLabel(transactionDate || receivedAt),
    senderNameRaw,
    senderEmail,
    senderPhoneLast4: extractSenderPhoneLast4(joinedText),
    amountReceived: extractAmount(joinedText),
    transactionReference,
    memo,
    parsedPayload: {
      provider: "gmail",
      subject,
      messageFrom,
      messageTo,
      transactionDate,
      senderNameRaw,
      senderEmail,
      senderPhoneLast4: extractSenderPhoneLast4(joinedText),
      amountReceived: extractAmount(joinedText),
      transactionReference,
      memo,
      snippet: message.snippet ?? "",
    },
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

async function runGmailRequest(work) {
  try {
    return await work();
  } catch (error) {
    if (isGmailInvalidGrantError(error)) {
      throw createGmailReauthorizationError();
    }
    throw error;
  }
}

function parsePositiveInteger(value, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function stripTemporalFilters(query) {
  return String(query || "")
    .replace(/\bnewer_than:\S+/gi, " ")
    .replace(/\bolder_than:\S+/gi, " ")
    .replace(/\bafter:\S+/gi, " ")
    .replace(/\bbefore:\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveIncrementalWindow(state) {
  const now = new Date();
  const overlapMinutes = parsePositiveInteger(
    process.env.GMAIL_SYNC_OVERLAP_MINUTES,
    DEFAULT_SYNC_OVERLAP_MINUTES,
  );
  const initialLookbackDays = parsePositiveInteger(
    process.env.GMAIL_INITIAL_LOOKBACK_DAYS,
    DEFAULT_INITIAL_LOOKBACK_DAYS,
  );
  const lastSyncAtRaw = state.integrations?.gmail?.lastSyncAt ?? null;
  const lastSyncAt = lastSyncAtRaw ? new Date(lastSyncAtRaw) : null;
  const hasValidLastSync = lastSyncAt && !Number.isNaN(lastSyncAt.getTime());

  const windowStart = hasValidLastSync
    ? new Date(lastSyncAt.getTime() - overlapMinutes * 60 * 1000)
    : new Date(now.getTime() - initialLookbackDays * 24 * 60 * 60 * 1000);

  return {
    mode: hasValidLastSync ? "incremental" : "bootstrap",
    overlapMinutes,
    initialLookbackDays,
    startedAfter: windowStart.toISOString(),
    startedAfterEpochSeconds: Math.floor(windowStart.getTime() / 1000),
  };
}

function buildIncrementalQuery(state) {
  const baseQuery = stripTemporalFilters(process.env.GMAIL_QUERY?.trim() || DEFAULT_GMAIL_QUERY);
  const window = deriveIncrementalWindow(state);
  const query = `${baseQuery} after:${window.startedAfterEpochSeconds}`.trim();
  return {
    query,
    window,
  };
}

export async function syncGmailInbox(state) {
  const auth = await authorizeGmail();
  const gmail = google.gmail({ version: "v1", auth });
  const { query, window } = buildIncrementalQuery(state);
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS || 20);

  const listResponse = await runGmailRequest(() =>
    gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    }),
  );

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
    const messageResponse = await runGmailRequest(() =>
      gmail.users.messages.get({
        userId: "me",
        id: messageMeta.id,
        format: "full",
      }),
    );

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
      paymentsToInsert.push({
        id: `pay-${parsedPayment.sourceMessageId || crypto.randomUUID()}`,
        customerId: null,
        customerName: null,
        matchedSignals: [],
        score: 0,
        amountReceived: parsedPayment.amountReceived || 0,
        invoiceId: null,
        sourceMessageId: parsedPayment.sourceMessageId,
        sourceProvider: parsedPayment.sourceProvider,
        sourceThreadId: parsedPayment.sourceThreadId,
        messageFromEmail: parsedPayment.messageFromEmail,
        messageToEmail: parsedPayment.messageToEmail,
        messageDateHeader: parsedPayment.messageDateHeader,
        transactionDate: parsedPayment.transactionDate,
        senderEmail: parsedPayment.senderEmail,
        senderPhoneLast4: parsedPayment.senderPhoneLast4,
        senderNameRaw: parsedPayment.senderNameRaw,
        subject: parsedPayment.subject,
        transactionReference: parsedPayment.transactionReference,
        memo: parsedPayment.memo,
        parsedPayload: parsedPayment.parsedPayload,
        matchStatus: "unmatched",
        matchSummary: "Parser could not confidently extract the full Zelle transaction.",
        reviewNotes: null,
        duplicateOfPaymentId: null,
        dateLabel: parsedPayment.dateLabel,
        rawText: parsedPayment.rawText,
        receivedAt: parsedPayment.receivedAt,
        reviewStatus: "exception",
      });
      summary.exceptionsAdded += 1;
      continue;
    }

    const matchResult = matchPaymentToState(parsedPayment, state);

    if (matchResult.kind === "pending") {
      paymentsToInsert.push({
        ...matchResult.payment,
        sourceProvider: parsedPayment.sourceProvider,
        sourceThreadId: parsedPayment.sourceThreadId,
        messageFromEmail: parsedPayment.messageFromEmail,
        messageToEmail: parsedPayment.messageToEmail,
        messageDateHeader: parsedPayment.messageDateHeader,
        transactionDate: parsedPayment.transactionDate,
        subject: parsedPayment.subject,
        transactionReference: parsedPayment.transactionReference,
        memo: parsedPayment.memo,
        parsedPayload: parsedPayment.parsedPayload,
        matchStatus: "matched",
        matchSummary: matchResult.payment.matchSummary ?? "Matched to customer and invoice.",
        reviewNotes: null,
        duplicateOfPaymentId: null,
        dateLabel: parsedPayment.dateLabel,
        rawText: parsedPayment.rawText,
        reviewStatus: "pending",
      });
      summary.pendingAdded += 1;
      continue;
    }

    paymentsToInsert.push({
      id: `pay-${parsedPayment.sourceMessageId || crypto.randomUUID()}`,
      customerId: matchResult.exception.customerId ?? null,
      customerName: matchResult.exception.customerName ?? null,
      matchedSignals: matchResult.exception.matchedSignals ?? [],
      score: Number(matchResult.exception.score || 0),
      amountReceived: parsedPayment.amountReceived || 0,
      invoiceId: matchResult.exception.invoiceId ?? null,
      sourceMessageId: parsedPayment.sourceMessageId,
      sourceProvider: parsedPayment.sourceProvider,
      sourceThreadId: parsedPayment.sourceThreadId,
      messageFromEmail: parsedPayment.messageFromEmail,
      messageToEmail: parsedPayment.messageToEmail,
      messageDateHeader: parsedPayment.messageDateHeader,
      transactionDate: parsedPayment.transactionDate,
      senderEmail: parsedPayment.senderEmail,
      senderPhoneLast4: parsedPayment.senderPhoneLast4,
      senderNameRaw: parsedPayment.senderNameRaw,
      subject: parsedPayment.subject,
      transactionReference: parsedPayment.transactionReference,
      memo: parsedPayment.memo,
      parsedPayload: parsedPayment.parsedPayload,
      matchStatus: matchResult.exception.kind === "duplicate" ? "unmatched" : matchResult.exception.kind,
      matchSummary: matchResult.exception.summary,
      reviewNotes: matchResult.exception.kind === "duplicate" ? matchResult.exception.summary : null,
      duplicateOfPaymentId: matchResult.exception.duplicateOfPaymentId ?? null,
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
    syncWindow: window,
    summary,
    message: buildSyncMessage(summary),
  };
}

export function buildGmailClientStatus(state) {
  const base = getGmailIntegrationStatus();
  const window = deriveIncrementalWindow(state);
  return {
    ...base,
    lastSyncAt: state.integrations?.gmail?.lastSyncAt ?? null,
    lastSyncSummary: state.integrations?.gmail?.lastSyncSummary ?? null,
    syncMode: window.mode,
    nextWindowStartsAfter: window.startedAfter,
    overlapMinutes: window.overlapMinutes,
  };
}
