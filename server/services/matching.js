import { normalizeDigits, normalizeEmail, normalizeName } from "../db/normalizers.js";

const ZELLE_REFERENCE_PROVIDERS = new Set(["gmail", "zelle", "manual_zelle"]);

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

function exactNameMatch(senderName, candidateName) {
  const sender = normalizeName(senderName);
  const candidate = normalizeName(candidateName);
  return Boolean(sender && candidate && sender === candidate);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function buildCandidateNote(customer, invoice) {
  const phone = customer.phones[0]?.value ?? "";
  const phoneLast4 = normalizeDigits(phone).slice(-4) || "----";
  const statusLabel = invoice?.status === "paid" ? "paid" : "open invoice";
  return `${customer.customerCode ?? customer.id} · ${invoice?.service ?? "Service"} ${invoice?.milestone ?? ""} · exp ${formatCurrency(invoice?.zelleAmount ?? 0)} · phone ••••${phoneLast4} · ${statusLabel}`.trim();
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

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100);
}

function normalizeDateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value);
  if (raw.includes("T")) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeTransactionReference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function sameReferenceScope(left, right) {
  const normalizedLeft = String(left || "gmail").trim().toLowerCase();
  const normalizedRight = String(right || "gmail").trim().toLowerCase();
  if (ZELLE_REFERENCE_PROVIDERS.has(normalizedLeft) && ZELLE_REFERENCE_PROVIDERS.has(normalizedRight)) {
    return true;
  }
  return normalizedLeft === normalizedRight;
}

function sameSenderIdentity(existingPayment, incomingPayment) {
  const existingEmail = normalizeEmail(existingPayment.senderEmail);
  const incomingEmail = normalizeEmail(incomingPayment.senderEmail);
  if (existingEmail && incomingEmail && existingEmail === incomingEmail) {
    return true;
  }

  const existingPhone = String(existingPayment.senderPhoneLast4 || "").trim();
  const incomingPhone = String(incomingPayment.senderPhoneLast4 || "").trim();
  if (existingPhone && incomingPhone && existingPhone === incomingPhone) {
    return true;
  }

  return matchName(existingPayment.senderNameRaw, incomingPayment.senderNameRaw);
}

function buildDuplicateSummary(existingPayment, { abuseRisk = false } = {}) {
  const destination = existingPayment.matchedInvoiceCode
    ? `${existingPayment.customerCode ?? existingPayment.customerId ?? "Customer"} · ${
        existingPayment.matchedInvoiceCode
      }`
    : existingPayment.customerCode ?? existingPayment.customerId ?? existingPayment.customerName ?? "customer record";
  const reference = existingPayment.transactionReference
    ? ` Transaction ref ${existingPayment.transactionReference} was already applied.`
    : "";
  return abuseRisk
    ? `Possible abuse / replay risk blocked.${reference} Do not apply this payment again unless bank records prove it is a different deposit. Existing applied payment: ${destination}.`
    : `Potential duplicate payment blocked.${reference} Existing applied payment: ${destination}.`;
}

function buildDuplicateException({ payment, existingPayment, fallbackCustomer = null, fallbackInvoice = null }) {
  const abuseRisk = Boolean(
    normalizeTransactionReference(payment.transactionReference) &&
      normalizeTransactionReference(payment.transactionReference) ===
        normalizeTransactionReference(existingPayment.transactionReference) &&
      sameReferenceScope(existingPayment.sourceProvider, payment.sourceProvider),
  );

  return {
    kind: "duplicate",
    customerId: existingPayment.customerId ?? fallbackCustomer?.id ?? null,
    customerName: existingPayment.customerName ?? fallbackCustomer?.name ?? null,
    customerCode: existingPayment.customerCode ?? fallbackCustomer?.customerCode ?? null,
    matchedSignals: [],
    score: 100,
    senderName: payment.senderNameRaw || existingPayment.senderNameRaw || "Unknown sender",
    amount: payment.amountReceived || 0,
    dateLabel: payment.dateLabel,
    senderEmail: payment.senderEmail,
    senderPhoneLast4: payment.senderPhoneLast4,
    invoiceId: existingPayment.invoiceId ?? fallbackInvoice?.id ?? null,
    summary: buildDuplicateSummary(existingPayment, { abuseRisk }),
    sourceMessageId: payment.sourceMessageId,
    duplicateOfPaymentId: existingPayment.id,
  };
}

function findOpenInvoices(state, customerId) {
  return state.invoices.filter(
    (invoice) =>
      invoice.customerId === customerId &&
      ["sent", "overdue"].includes(invoice.status),
  );
}

function buildMatchSummary({ customer, invoice, matchedSignals, score }) {
  const invoiceLabel = invoice
    ? `${invoice.invoiceCode} · ${invoice.service}${invoice.milestone ? ` ${invoice.milestone}` : ""}`
    : "No invoice matched yet";
  return `${customer.customerCode ?? customer.id} · ${matchedSignals.join(" + ")} · score ${score} · ${invoiceLabel}`;
}

function findConfirmedDuplicatePayment(state, payment, { customerId = null, invoiceId = null } = {}) {
  const confirmedPayments = state.payments.filter((entry) => entry.reviewStatus === "confirmed");
  const incomingReference = normalizeTransactionReference(payment.transactionReference);

  if (incomingReference) {
    const referencedDuplicate = confirmedPayments.find(
      (entry) =>
        sameReferenceScope(entry.sourceProvider, payment.sourceProvider) &&
        normalizeTransactionReference(entry.transactionReference) === incomingReference,
    );
    if (referencedDuplicate) {
      return referencedDuplicate;
    }
  }

  if (invoiceId) {
    const invoiceDuplicate = confirmedPayments.find((entry) => entry.invoiceId === invoiceId);
    if (invoiceDuplicate) {
      return invoiceDuplicate;
    }
  }

  if (!customerId) {
    return null;
  }

  const incomingAmount = roundMoney(payment.amountReceived);
  const incomingDate = normalizeDateOnly(payment.transactionDate || payment.receivedAt);
  return (
    confirmedPayments.find((entry) => {
      if (entry.customerId !== customerId) {
        return false;
      }

      if (roundMoney(entry.amountReceived) !== incomingAmount) {
        return false;
      }

      const existingDate = normalizeDateOnly(entry.transactionDate || entry.receivedAt);
      if (incomingDate && existingDate && incomingDate !== existingDate) {
        return false;
      }

      return sameSenderIdentity(entry, payment);
    }) ?? null
  );
}

export function matchPaymentToState(payment, state) {
  const exactDuplicate = findConfirmedDuplicatePayment(state, payment);
  if (exactDuplicate) {
    return {
      kind: "exception",
      exception: buildDuplicateException({
        payment,
        existingPayment: exactDuplicate,
      }),
    };
  }

  const candidates = state.customers
    .map((customer) => {
      const nameMatched =
        matchName(payment.senderNameRaw, customer.name) ||
        customer.aliases.some((alias) => matchName(payment.senderNameRaw, alias.name));
      const exactNameMatched =
        exactNameMatch(payment.senderNameRaw, customer.name) ||
        customer.aliases.some((alias) => exactNameMatch(payment.senderNameRaw, alias.name));
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
        (invoice) => roundMoney(invoice.zelleAmount) === roundMoney(payment.amountReceived),
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
        exactNameMatched,
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
        customerId: null,
        customerName: null,
        customerCode: null,
        matchedSignals: [],
        score: 0,
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
        customerId: null,
        customerName: null,
        customerCode: null,
        matchedSignals: topCandidate.matchedSignals,
        score: topCandidate.score,
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
        customerId: topCandidate.customer.id,
        customerName: topCandidate.customer.name,
        customerCode: topCandidate.customer.customerCode ?? null,
        matchedSignals: topCandidate.matchedSignals,
        score: topCandidate.score,
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

  if (topCandidate.score >= 50 && topCandidate.exactNameMatched && !topCandidate.matchedInvoice) {
    return {
      kind: "pending",
      payment: {
        id: `pay-${payment.sourceMessageId || crypto.randomUUID()}`,
        customerId: topCandidate.customer.id,
        customerName: topCandidate.customer.name,
        customerCode: topCandidate.customer.customerCode ?? null,
        matchedSignals: topCandidate.matchedSignals,
        score: topCandidate.score,
        amountReceived: payment.amountReceived,
        invoiceId: null,
        matchedInvoiceCode: null,
        sourceMessageId: payment.sourceMessageId,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        senderNameRaw: payment.senderNameRaw,
        receivedAt: payment.receivedAt,
        matchSummary: buildMatchSummary({
          customer: topCandidate.customer,
          invoice: null,
          matchedSignals: topCandidate.matchedSignals,
          score: topCandidate.score,
        }),
      },
    };
  }

  if (topCandidate.score >= 50 && topCandidate.matchedInvoice) {
    const duplicate = findConfirmedDuplicatePayment(state, payment, {
      customerId: topCandidate.customer.id,
      invoiceId: topCandidate.matchedInvoice.id,
    });

    if (duplicate) {
      return {
        kind: "exception",
        exception: buildDuplicateException({
          payment,
          existingPayment: duplicate,
          fallbackCustomer: topCandidate.customer,
          fallbackInvoice: topCandidate.matchedInvoice,
        }),
      };
    }

    return {
      kind: "pending",
      payment: {
        id: `pay-${payment.sourceMessageId || crypto.randomUUID()}`,
        customerId: topCandidate.customer.id,
        customerName: topCandidate.customer.name,
        customerCode: topCandidate.customer.customerCode ?? null,
        matchedSignals: topCandidate.matchedSignals,
        score: topCandidate.score,
        amountReceived: payment.amountReceived,
        invoiceId: topCandidate.matchedInvoice.id,
        matchedInvoiceCode: topCandidate.matchedInvoice.invoiceCode,
        sourceMessageId: payment.sourceMessageId,
        senderEmail: payment.senderEmail,
        senderPhoneLast4: payment.senderPhoneLast4,
        senderNameRaw: payment.senderNameRaw,
        receivedAt: payment.receivedAt,
        matchSummary: buildMatchSummary({
          customer: topCandidate.customer,
          invoice: topCandidate.matchedInvoice,
          matchedSignals: topCandidate.matchedSignals,
          score: topCandidate.score,
        }),
      },
    };
  }

  return {
    kind: "exception",
    exception: {
      kind: "unmatched",
      customerId: topCandidate.customer.id,
      customerName: topCandidate.customer.name,
      customerCode: topCandidate.customer.customerCode ?? null,
      matchedSignals: topCandidate.matchedSignals,
      score: topCandidate.score,
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
