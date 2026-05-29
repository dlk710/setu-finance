import nodemailer from "nodemailer";
import { renderInvoiceEmail, renderReceiptEmail } from "./templates.js";

let cachedTransporter;

function hasValue(value) {
  return Boolean(value && String(value).trim());
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
      pass: process.env.SMTP_PASS.trim(),
    },
  });

  return cachedTransporter;
}

async function sendMessage({ to, subject, text, html }) {
  const transporter = getTransporter();
  return transporter.sendMail({
    from: process.env.SMTP_FROM.trim(),
    to,
    subject,
    text,
    html,
  });
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
  return sendMessage({
    to,
    ...payload,
  });
}
