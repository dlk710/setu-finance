function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractEmailAddress(value) {
  const match = String(value || "").match(/[A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatLongDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  const raw =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim().slice(0, 10);
  const parsedDate = new Date(`${raw}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsedDate);
}

function buildCardPaymentUrl(invoice) {
  const baseUrl = process.env.CARD_PAYMENT_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}invoice=${encodeURIComponent(invoice.invoiceCode)}`;
}

function resolveZellePayTarget() {
  return (
    process.env.ZELLE_PAY_TO?.trim() ||
    process.env.SMTP_USER?.trim() ||
    extractEmailAddress(process.env.SMTP_FROM?.trim()) ||
    "Configure ZELLE_PAY_TO in the local .env file"
  );
}

export function renderInvoiceEmail({ customer, invoice }) {
  const zellePayTo = resolveZellePayTarget();
  const cardUrl = buildCardPaymentUrl(invoice);
  const serviceLabel = `${invoice.service}${invoice.milestone ? ` — ${invoice.milestone}` : ""}`;

  return {
    subject: `Invoice ${invoice.invoiceCode} · ${serviceLabel}`,
    text: [
      `Hi ${customer.name},`,
      "",
      `Your invoice for ${serviceLabel} is ready.`,
      `Due date: ${formatLongDate(invoice.dueDate)}`,
      `Invoice ref: ${invoice.invoiceCode}`,
      "",
      `Zelle (discounted): ${formatCurrency(invoice.zelleAmount)}`,
      `Send to: ${zellePayTo}`,
      `Memo / reference: ${invoice.invoiceCode}`,
      "",
      `Card (full price): ${formatCurrency(invoice.cardAmount)}`,
      cardUrl ? `Card payment link: ${cardUrl}` : "Card payment link: configure CARD_PAYMENT_BASE_URL to include this automatically.",
      "",
      "Thank you,",
      "Setu billing",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1a1a1f; line-height: 1.6;">
        <p>Hi ${escapeHtml(customer.name)},</p>
        <p>Your invoice for <strong>${escapeHtml(serviceLabel)}</strong> is ready.</p>
        <ul>
          <li><strong>Due date:</strong> ${escapeHtml(formatLongDate(invoice.dueDate))}</li>
          <li><strong>Invoice ref:</strong> ${escapeHtml(invoice.invoiceCode)}</li>
        </ul>
        <p><strong>Zelle (discounted):</strong> ${escapeHtml(formatCurrency(invoice.zelleAmount))}<br>
        <strong>Send to:</strong> ${escapeHtml(zellePayTo)}<br>
        <strong>Memo / reference:</strong> ${escapeHtml(invoice.invoiceCode)}</p>
        <p><strong>Card (full price):</strong> ${escapeHtml(formatCurrency(invoice.cardAmount))}<br>
        ${
          cardUrl
            ? `<a href="${escapeHtml(cardUrl)}">Pay by card</a>`
            : "Configure CARD_PAYMENT_BASE_URL to include a card link automatically."
        }</p>
        <p>Thank you,<br>Setu billing</p>
      </div>
    `,
  };
}

export function renderReceiptEmail({ customer, payment, invoice }) {
  const amount = payment.amountReceived ?? payment.amount ?? 0;
  const serviceLabel = invoice
    ? `${invoice.service}${invoice.milestone ? ` — ${invoice.milestone}` : ""}`
    : "your invoice";
  const transactionDate = payment.transactionDate ?? null;
  const transactionReference = payment.transactionReference ?? null;
  const memo = payment.memo ?? null;

  return {
    subject: `Receipt · ${invoice?.invoiceCode ?? "Payment confirmed"}`,
    text: [
      `Hi ${customer.name},`,
      "",
      `We have confirmed your payment of ${formatCurrency(amount)} for ${serviceLabel}.`,
      "A PDF receipt is attached for your records.",
      invoice ? `Invoice ref: ${invoice.invoiceCode}` : null,
      transactionDate ? `Transaction date: ${transactionDate}` : null,
      transactionReference ? `Transaction ref: ${transactionReference}` : null,
      memo ? `Memo: ${memo}` : null,
      "",
      "Thank you,",
      "Setu billing",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1a1a1f; line-height: 1.6;">
        <p>Hi ${escapeHtml(customer.name)},</p>
        <p>We have confirmed your payment of <strong>${escapeHtml(formatCurrency(amount))}</strong> for ${escapeHtml(serviceLabel)}.</p>
        <p>A PDF receipt is attached for your records.</p>
        ${invoice ? `<p><strong>Invoice ref:</strong> ${escapeHtml(invoice.invoiceCode)}</p>` : ""}
        ${transactionDate ? `<p><strong>Transaction date:</strong> ${escapeHtml(transactionDate)}</p>` : ""}
        ${transactionReference ? `<p><strong>Transaction ref:</strong> ${escapeHtml(transactionReference)}</p>` : ""}
        ${memo ? `<p><strong>Memo:</strong> ${escapeHtml(memo)}</p>` : ""}
        <p>Thank you,<br>Setu billing</p>
      </div>
    `,
  };
}
