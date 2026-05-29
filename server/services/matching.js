import { normalizeDigits, normalizeName } from "../db/normalizers.js";

function matchName(senderName, candidateName) {
  const sender = normalizeName(senderName);
  const candidate = normalizeName(candidateName);

  if (!sender || !candidate) {
    return false;
  }

  if (sender === candidate) {
    return true;
  }

  const senderParts = sender.split(" ").filter(Boolean);
  const candidateParts = candidate.split(" ").filter(Boolean);
  if (senderParts.length < 2 || candidateParts.length < 2) {
    return false;
  }

  const senderLast = senderParts.at(-1);
  const candidateLast = candidateParts.at(-1);
  const senderFirst = senderParts[0];
  const candidateFirst = candidateParts[0];

  return senderLast === candidateLast && senderFirst[0] === candidateFirst[0];
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildCandidateNote(customer, invoice) {
  const phone = customer.phones[0]?.value ?? "";
  const phoneLast4 = normalizeDigits(phone).slice(-4) || "----";
  const statusLabel = invoice?.status === "paid" ? "paid" : "open invoice";
  return `${invoice?.service ?? "Service"} ${invoice?.milestone ?? ""} · exp ${formatCurrency(invoice?.zelleAmount ?? 0)} · phone ••••${phoneLast4} · ${statusLabel}`.trim();
}

function buildMatchedSignals({ nameMatched, emailMatched, phoneMatched, amountMatched }) {
  const signals = [];
  if (nameMatched) {
    signals.push("name");
  }
  if (phoneMatched) {
    signals.push("phone");
  }
  if (emailMatched) {
    signals.push("email");
  }
  if (amountMatched) {
    signals.push("amount");
  }
  return signals;
}

function findOpenInvoices(state, customerId) {
  return state.invoices.filter(
    (invoice) =>
      invoice.customerId === customerId &&
      ["sent", "overdue"].includes(invoice.status),
  );
}

export function matchPaymentToState(payment, state) {
  const candidates = state.customers
    .map((customer) => {
      const nameMatched =
        matchName(payment.senderNameRaw, customer.name) ||
        customer.aliases.some((alias) => matchName(payment.senderNameRaw, alias.name));
      const emailMatched =
        Boolean(payment.senderEmail) &&
        (customer.emails.some(({ value }) => value.toLowerCase() === payment.senderEmail.toLowerCase()) ||
          customer.aliases.some(
            (alias) => alias.email && alias.email.toLowerCase() === payment.senderEmail.toLowerCase(),
          ));
      const phoneMatched =
        Boolean(payment.senderPhoneLast4) &&
        (customer.phones.some(
          ({ value }) => normalizeDigits(value).slice(-4) === payment.senderPhoneLast4,
        ) ||
          customer.aliases.some((alias) => alias.phoneLast4 === payment.senderPhoneLast4));

      const openInvoices = findOpenInvoices(state, customer.id);
      const exactAmountInvoices = openInvoices.filter(
        (invoice) => Math.round(invoice.zelleAmount) === Math.round(payment.amountReceived),
      );

      const amountMatched = exactAmountInvoices.length === 1;
      const matchedInvoice = amountMatched ? exactAmountInvoices[0] : null;

      let score = 0;
      if (nameMatched) {
        score += 50;
      }
      if (phoneMatched) {
        score += 30;
      }
      if (emailMatched) {
        score += 30;
      }
      if (amountMatched) {
        score += 20;
      }

      return {
        customer,
        openInvoices,
        matchedInvoice,
        score,
        matchedSignals: buildMatchedSignals({
          nameMatched,
          emailMatched,
          phoneMatched,
          amountMatched,
        }),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!candidates.length) {
    return {
      kind: "exception",
      exception: {
        kind: "unmatched",
        senderName: payment.senderNameRaw || "Unknown sender",
        amount: payment.amountReceived || 0,
        dateLabel: payment.dateLabel,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        summary: "No customer record matched the parsed payment details",
        sourceMessageId: payment.sourceMessageId,
      },
    };
  }

  const topCandidate = candidates[0];
  const ambiguousCandidates = candidates.filter(
    (candidate) => candidate.score === topCandidate.score,
  );

  if (ambiguousCandidates.length > 1) {
    return {
      kind: "exception",
      exception: {
        kind: "ambiguous",
        senderName: payment.senderNameRaw || "Unknown sender",
        amount: payment.amountReceived || 0,
        dateLabel: payment.dateLabel,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        summary: "Two or more customers share the same strongest match",
        aliasName: payment.senderNameRaw || "Unknown sender",
        sourceMessageId: payment.sourceMessageId,
        candidates: ambiguousCandidates.slice(0, 3).map((candidate, index) => ({
          customerId: candidate.customer.id,
          name: candidate.customer.name,
          note: buildCandidateNote(candidate.customer, candidate.openInvoices[0]),
          primary: index === 0,
        })),
      },
    };
  }

  if (!topCandidate.matchedInvoice && topCandidate.openInvoices.length) {
    const expectedInvoice = topCandidate.openInvoices[0];
    return {
      kind: "exception",
      exception: {
        kind: "mismatch",
        senderName: payment.senderNameRaw || topCandidate.customer.name,
        amount: payment.amountReceived || 0,
        expectedAmount: expectedInvoice.zelleAmount,
        dateLabel: payment.dateLabel,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        service: expectedInvoice.service,
        milestone: expectedInvoice.milestone,
        invoiceId: expectedInvoice.id,
        summary: "Identity matched, but the payment amount did not match the stored expected Zelle amount",
        sourceMessageId: payment.sourceMessageId,
      },
    };
  }

  if (topCandidate.score >= 50 && topCandidate.matchedInvoice) {
    return {
      kind: "pending",
      payment: {
        id: `pay-${payment.sourceMessageId || crypto.randomUUID()}`,
        customerId: topCandidate.customer.id,
        customerName: topCandidate.customer.name,
        matchedSignals: topCandidate.matchedSignals,
        score: topCandidate.score,
        amountReceived: payment.amountReceived,
        invoiceId: topCandidate.matchedInvoice.id,
        sourceMessageId: payment.sourceMessageId,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        senderNameRaw: payment.senderNameRaw,
        receivedAt: payment.receivedAt,
      },
    };
  }

  return {
    kind: "exception",
    exception: {
      kind: "unmatched",
      senderName: payment.senderNameRaw || "Unknown sender",
      amount: payment.amountReceived || 0,
      dateLabel: payment.dateLabel,
      senderEmail: payment.senderEmail,
      senderPhoneLast4: payment.senderPhoneLast4,
      summary: "A partial identity match was found, but not enough to safely confirm the payment",
      sourceMessageId: payment.sourceMessageId,
    },
  };
}
