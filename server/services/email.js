import nodemailer from "nodemailer";
import { renderInvoiceEmail, renderReceiptEmail } from "./templates.js";
import { buildReceiptPdfFilename, generateReceiptPdf } from "./receiptPdf.js";

let cachedTransporter;

function hasValue(value) {
  return Boolean(value && String(value).trim());
}

function isGmailTransport() {
  const host = String(process.env.SMTP_HOST || "").trim().toLowerCase();
  const user = String(process.env.SMTP_USER || "").trim().toLowerCase();
  return host === "smtp.gmail.com" || user.endsWith("@gmail.com");
}

function getNormalizedSmtpPassword() {
  const raw = String(process.env.SMTP_PASS || "");
  const trimmed = raw.trim();

  if (isGmailTransport()) {
    return trimmed.replace(/\s+/g, "");
  }

  return trimmed;
}

function explainEmailError(error) {
  if (error?.code === "EAUTH" && isGmailTransport()) {
    const username = process.env.SMTP_USER?.trim() || "your Gmail account";
    const authError = new Error(
      `Gmail rejected the outbound login for ${username}. Use a Gmail App Password in SMTP_PASS; a normal Gmail password will not work.`,
    );
    authError.statusCode = 400;
    return authError;
  }

  return error;
}

export function getEmailIntegrationStatus() {
  const configured =
    hasValue(process.env.SMTP_URL) ||
    (hasValue(process.env.SMTP_HOST) &&
      hasValue(process.env.SMTP_PORT) &&
      hasValue(process.env.SMTP_USER) &&
      hasValue(process.env.SMTP_PASS) &&
      hasValue(process.env.SMTP_FROM));

  return {
    configured,
    from: process.env.SMTP_FROM?.trim() || null,
  };
}

function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  if (process.env.SMTP_URL?.trim()) {
    cachedTransporter = nodemailer.createTransport(process.env.SMTP_URL.trim());
    return cachedTransporter;
  }

  if (!getEmailIntegrationStatus().configured) {
    throw new Error(
      "Email is not configured yet. Add SMTP settings to .env before sending real mail.",
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: getNormalizedSmtpPassword(),
    },
  });

  return cachedTransporter;
}

async function sendMessage({ to, subject, text, html, attachments = [] }) {
  try {
    const transporter = getTransporter();
    return await transporter.sendMail({
      from: process.env.SMTP_FROM.trim(),
      to,
      subject,
      text,
      html,
      attachments,
    });
  } catch (error) {
    throw explainEmailError(error);
  }
}

export async function sendInvoiceEmail({ customer, invoice, to }) {
  const payload = renderInvoiceEmail({ customer, invoice });
  return sendMessage({
    to,
    ...payload,
  });
}

export async function sendReceiptEmail({ customer, payment, invoice, to }) {
  const payload = renderReceiptEmail({ customer, payment, invoice });
  const receiptPdf = await generateReceiptPdf({
    customer,
    payment,
    invoice,
    recipient: to,
  });
  return sendMessage({
    to,
    ...payload,
    attachments: [
      {
        filename: buildReceiptPdfFilename({ invoice, payment }),
        content: receiptPdf,
        contentType: "application/pdf",
      },
    ],
  });
}
