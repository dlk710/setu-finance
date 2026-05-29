import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "Not captured";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) {
    return "Not captured";
  }

  const raw = String(value);
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildServiceLabel(invoice) {
  if (!invoice) {
    return "Applied payment";
  }

  return `${invoice.service}${invoice.milestone ? ` — ${invoice.milestone}` : ""}`;
}

function drawWrappedText(page, font, text, x, y, width, size = 11, color = rgb(0.1, 0.11, 0.15)) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) {
    return y;
  }

  const lines = [];
  let currentLine = words[0];

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(nextLine, size) <= width) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);

  let cursorY = y;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size,
      font,
      color,
    });
    cursorY -= size + 4;
  }

  return cursorY;
}

export function buildReceiptPdfFilename({ invoice, payment }) {
  const reference =
    sanitizeFilenamePart(invoice?.invoiceCode) ||
    sanitizeFilenamePart(payment?.transactionReference) ||
    sanitizeFilenamePart(payment?.id) ||
    "payment";
  return `setu-receipt-${reference}.pdf`;
}

export async function generateReceiptPdf({ customer, payment, invoice, recipient }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 54;
  const labelX = margin;
  const valueX = 220;
  const pageWidth = page.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const ink = rgb(0.12, 0.13, 0.17);
  const subtle = rgb(0.42, 0.45, 0.52);
  const accent = rgb(0.71, 0.43, 0.08);

  page.drawText("Setu Billing", {
    x: margin,
    y: 744,
    size: 12,
    font: boldFont,
    color: accent,
  });

  page.drawText("Payment Receipt", {
    x: margin,
    y: 708,
    size: 26,
    font: boldFont,
    color: ink,
  });

  page.drawText("Simple confirmation for the applied transaction saved in the Setu portal.", {
    x: margin,
    y: 688,
    size: 11,
    font: regularFont,
    color: subtle,
  });

  page.drawLine({
    start: { x: margin, y: 670 },
    end: { x: pageWidth - margin, y: 670 },
    thickness: 1,
    color: rgb(0.88, 0.89, 0.92),
  });

  const rows = [
    ["Customer", customer?.name ?? "Unknown customer"],
    ["Customer ID", customer?.customerCode ?? customer?.id ?? "Not assigned"],
    ["Primary email", recipient ?? "Not captured"],
    ["Amount received", formatCurrency(payment?.amountReceived ?? payment?.amount ?? 0)],
    ["Invoice reference", invoice?.invoiceCode ?? "Not linked"],
    ["Service", buildServiceLabel(invoice)],
    ["Transaction number", payment?.transactionReference ?? "Not captured"],
    ["Transaction date", formatDate(payment?.transactionDate)],
    ["Applied in portal", formatDateTime(payment?.appliedAt ?? new Date().toISOString())],
    ["Receipt issued", formatDateTime(new Date().toISOString())],
    ["Memo", payment?.memo ?? "Not captured"],
  ];

  let cursorY = 638;
  for (const [label, value] of rows) {
    page.drawText(label, {
      x: labelX,
      y: cursorY,
      size: 10,
      font: boldFont,
      color: subtle,
    });
    cursorY = drawWrappedText(page, regularFont, value, valueX, cursorY, contentWidth - (valueX - margin), 11, ink);
    cursorY -= 10;
  }

  page.drawLine({
    start: { x: margin, y: cursorY + 2 },
    end: { x: pageWidth - margin, y: cursorY + 2 },
    thickness: 1,
    color: rgb(0.88, 0.89, 0.92),
  });

  drawWrappedText(
    page,
    regularFont,
    "This receipt confirms that Setu recorded the payment above against the customer account. Keep this PDF for your records.",
    margin,
    cursorY - 28,
    contentWidth,
    10,
    subtle,
  );

  return Buffer.from(await pdf.save());
}
