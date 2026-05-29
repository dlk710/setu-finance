import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const workspace = process.cwd();
const requireFromWorkspace = createRequire(path.join(workspace, "package.json"));
const artifact = await import(requireFromWorkspace.resolve("@oai/artifact-tool"));
const { Presentation, PresentationFile } = artifact;

const W = 1280;
const H = 720;
const colors = {
  bg: "#f7f1e8",
  panel: "#fffaf2",
  panelSoft: "#fffdf8",
  ink: "#1d1a17",
  muted: "#6f655b",
  line: "#e7ddd0",
  accent: "#bc6c25",
  accentSoft: "#f4dfca",
  green: "#275d4e",
  rose: "#8f2d56",
  gold: "#e8a84e",
};

function frame(left, top, width, height) {
  return { left, top, width, height };
}

function addRect(slide, { left, top, width, height, fill = colors.panel, line = colors.line, radius } = {}) {
  const shape = slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: frame(left, top, width, height),
    fill,
    line: { style: "solid", fill: line, width: line === "transparent" ? 0 : 1 },
  });
  if (radius && shape.adjustments) {
    shape.adjustments.set("radius", radius);
  }
  return shape;
}

function addText(slide, {
  text,
  left,
  top,
  width,
  height,
  fontSize = 22,
  color = colors.ink,
  bold = false,
  align = "left",
  valign = "top",
  fill = "transparent",
  line = "transparent",
  font = bold ? "Aptos Display" : "Aptos",
} = {}) {
  const box = slide.shapes.add({
    geometry: "rect",
    position: frame(left, top, width, height),
    fill,
    line: { style: "solid", fill: line, width: line === "transparent" ? 0 : 1 },
  });
  box.text = text;
  box.text.fontSize = fontSize;
  box.text.color = color;
  box.text.bold = bold;
  box.text.typeface = font;
  box.text.alignment = align;
  box.text.verticalAlignment = valign;
  box.text.insets = { left: 0, right: 0, top: 0, bottom: 0 };
  return box;
}

function addChip(slide, x, y, label, fill = colors.accentSoft, color = colors.accent) {
  addRect(slide, { left: x, top: y, width: label.length * 7.2 + 34, height: 28, fill, line: "transparent", radius: 1 });
  addText(slide, { text: label, left: x + 16, top: y + 7, width: label.length * 7.2 + 10, height: 16, fontSize: 12, color, bold: true });
}

function addHeader(slide, step, title, subtitle) {
  addText(slide, { text: step.toUpperCase(), left: 72, top: 44, width: 260, height: 20, fontSize: 12, color: colors.muted, bold: true });
  addRect(slide, { left: 72, top: 72, width: 56, height: 4, fill: colors.accent, line: "transparent" });
  addText(slide, { text: title, left: 72, top: 96, width: 980, height: 60, fontSize: 32, color: colors.ink, bold: true });
  if (subtitle) {
    addText(slide, { text: subtitle, left: 72, top: 148, width: 980, height: 44, fontSize: 17, color: "#4f4741" });
  }
}

function addFooter(slide, leftText, rightText, slideNumber) {
  addText(slide, { text: leftText, left: 72, top: 680, width: 420, height: 18, fontSize: 11, color: colors.muted });
  addText(slide, { text: rightText, left: 780, top: 680, width: 420, height: 18, fontSize: 11, color: colors.muted, align: "right" });
  addText(slide, { text: String(slideNumber).padStart(2, "0"), left: 1180, top: 38, width: 40, height: 24, fontSize: 14, color: colors.accent, bold: true, align: "right" });
}

function addCard(slide, { x, y, w, h, title, body, accent = colors.accent }) {
  addRect(slide, { left: x, top: y, width: w, height: h, fill: colors.panelSoft, line: colors.line, radius: 1 });
  addRect(slide, { left: x, top: y, width: w, height: 8, fill: accent, line: "transparent", radius: 1 });
  addText(slide, { text: title, left: x + 18, top: y + 24, width: w - 36, height: 26, fontSize: 18, color: colors.ink, bold: true });
  addText(slide, { text: body, left: x + 18, top: y + 58, width: w - 36, height: h - 76, fontSize: 14, color: colors.muted });
}

function addMetricCard(slide, { x, y, w, h, metric, label }) {
  addRect(slide, { left: x, top: y, width: w, height: h, fill: colors.panelSoft, line: colors.line, radius: 1 });
  addText(slide, { text: metric, left: x + 18, top: y + 20, width: w - 36, height: 40, fontSize: 28, color: colors.accent, bold: true });
  addText(slide, { text: label, left: x + 18, top: y + 62, width: w - 36, height: h - 80, fontSize: 13, color: colors.muted });
}

function addBulletRow(slide, { x, y, w, title, body, badge, badgeFill = colors.accent, badgeText = "#ffffff" }) {
  addRect(slide, { left: x, top: y, width: w, height: 74, fill: colors.panelSoft, line: colors.line, radius: 1 });
  addRect(slide, { left: x + 14, top: y + 16, width: 38, height: 38, fill: badgeFill, line: "transparent" });
  addText(slide, { text: badge, left: x + 14, top: y + 25, width: 38, height: 18, fontSize: 16, color: badgeText, bold: true, align: "center" });
  addText(slide, { text: title, left: x + 66, top: y + 14, width: w - 84, height: 22, fontSize: 16, color: colors.ink, bold: true });
  addText(slide, { text: body, left: x + 66, top: y + 36, width: w - 84, height: 28, fontSize: 13, color: colors.muted });
}

function addQuote(slide, { x, y, w, h, text, accent = colors.rose }) {
  addRect(slide, { left: x, top: y, width: w, height: h, fill: colors.panelSoft, line: colors.line, radius: 1 });
  addRect(slide, { left: x, top: y, width: 6, height: h, fill: accent, line: "transparent" });
  addText(slide, { text, left: x + 22, top: y + 20, width: w - 40, height: h - 40, fontSize: 18, color: "#3c332d" });
}

function slide1(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addText(slide, { text: "SETU FINANCE", left: 72, top: 54, width: 300, height: 18, fontSize: 12, color: colors.muted, bold: true });
  addText(slide, { text: "One finance operations system for onboarding, invoicing, payment review, and receipts.", left: 72, top: 100, width: 690, height: 126, fontSize: 40, color: colors.ink, bold: true });
  addText(slide, { text: "Setu Finance turns a fragmented workflow into one controlled operating path with queue-based review, structured Zelle capture, customer-level visibility, and receipt delivery from a single portal.", left: 72, top: 250, width: 640, height: 90, fontSize: 18, color: "#4f4741" });
  addChip(slide, 72, 366, "Postgres-backed");
  addChip(slide, 240, 366, "Gmail sync enabled");
  addChip(slide, 440, 366, "PDF receipts live");
  addChip(slide, 618, 366, "Business-ready prototype");
  addRect(slide, { left: 800, top: 86, width: 394, height: 520, fill: "#fff8ef", line: colors.line, radius: 1 });
  addText(slide, { text: "CURRENT PRODUCT STATE", left: 830, top: 122, width: 260, height: 18, fontSize: 12, color: colors.muted, bold: true });
  addMetricCard(slide, { x: 830, y: 160, w: 156, h: 146, metric: "360", label: "Customer view with signup date, invoices, payments, referrals, and billing context" });
  addMetricCard(slide, { x: 1008, y: 160, w: 156, h: 146, metric: "1 click", label: "Human apply action after the portal prepares a reviewable transaction record" });
  addMetricCard(slide, { x: 830, y: 326, w: 156, h: 146, metric: "PDF", label: "Receipts can be sent or re-sent from completed transactions without changing the ledger" });
  addMetricCard(slide, { x: 1008, y: 326, w: 156, h: 146, metric: "AWS-ready", label: "Low-cost path mapped for S3, App Runner, RDS, SQS, Lambda, and SES" });
  addFooter(slide, "Setu Finance business story", "Finance operations foundation, not just an invoice screen", 1);
  return slide;
}

function slide2(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 2 · Problem", "Finance teams are stitching together customer data, invoices, inbox threads, and memory.");
  addCard(slide, { x: 72, y: 212, w: 350, h: 164, title: "Onboarding is disconnected", body: "Customer details, services, and billing intent are often not captured once in a durable way.", accent: colors.accent });
  addCard(slide, { x: 450, y: 212, w: 350, h: 164, title: "Payment evidence lives in email", body: "Zelle confirmations arrive in inboxes, not in a structured operations system.", accent: colors.green });
  addCard(slide, { x: 828, y: 212, w: 350, h: 164, title: "Receipts and follow-up are manual", body: "Finance teams re-open threads, re-check amounts, and risk inconsistent customer communication.", accent: colors.rose });
  addQuote(slide, { x: 72, y: 418, w: 1106, h: 154, text: "The cost is not just time. It is also audit risk, duplicate handling risk, and weak visibility into who has paid, who needs follow-up, and where exceptions are getting stuck." });
  addFooter(slide, "Business pain today", "High manual effort + high risk of operational drift", 2);
  return slide;
}

function slide3(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 3 · Solution", "Setu Finance creates one operating path from client signup to confirmed receipt.", "The product keeps the finance team in control while still automating the expensive and repetitive parts of the work.");
  addCard(slide, { x: 72, y: 236, w: 520, h: 144, title: "Structured client onboarding", body: "Required identity details, optional address, referral source, and dated service enrollments become the finance record from day one.", accent: colors.accent });
  addCard(slide, { x: 618, y: 236, w: 520, h: 144, title: "Invoice flow tied to the customer record", body: "Invoices reuse enrolled services and saved contacts instead of re-keying basic information every time.", accent: colors.green });
  addCard(slide, { x: 72, y: 402, w: 520, h: 144, title: "Zelle email capture", body: "Inbox sync saves amount, date, memo, transaction number, payer hints, and raw extract into one transaction record.", accent: colors.rose });
  addCard(slide, { x: 618, y: 402, w: 520, h: 144, title: "Human-controlled payment apply", body: "The matching engine prepares the transaction, but finance still decides when to post it into the ledger.", accent: colors.gold });
  addFooter(slide, "Design principle", "Automate the preparation, not the financial judgment", 3);
  return slide;
}

function slide4(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 4 · Process Flow", "Simple business flow");
  const steps = [
    ["1", "Onboard client", "Create the customer record with required contact details, services, referral source, and home address when available."],
    ["2", "Create invoice", "Build the invoice from enrolled services and saved customer data, then send it by email."],
    ["3", "Sync or save transaction", "Bring Zelle confirmation details into the portal as a structured transaction record."],
    ["4", "Match and queue", "Clear matches go to payments to confirm. Mismatches, duplicates, and ambiguity go to exceptions."],
    ["5", "Apply transaction", "A finance user completes the final ledger action with one click after reviewing the prepared record."],
    ["6", "Completed transactions", "The transaction remains visible after apply so finance can send or re-send the receipt later."],
    ["7", "Send PDF receipt", "Receipt goes to the customer's primary email with amount, transaction number, memo, dates, and invoice reference when available."],
    ["8", "Update visibility", "Dashboard totals, activity history, invoice status, and referral progress update from the applied record."],
  ];
  steps.forEach(([num, title, body], index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 72 + col * 280;
    const y = 216 + row * 182;
    addCard(slide, { x, y, w: 248, h: 150, title, body, accent: row === 0 ? colors.accent : colors.green });
    addRect(slide, { left: x + 18, top: y + 18, width: 36, height: 36, fill: row === 0 ? colors.accent : colors.green, line: "transparent" });
    addText(slide, { text: num, left: x + 18, top: y + 26, width: 36, height: 14, fontSize: 16, color: "#ffffff", bold: true, align: "center" });
  });
  addFooter(slide, "Simple explanation for business teams", "Capture → review → apply → communicate", 4);
  return slide;
}

function slide5(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 5 · Feature Set", "The product already spans more than billing.");
  const items = [
    ["Onboarding", "Customer creation first", "Mandatory first name, last name, email, phone, and services. Optional address, payment preferences, referral source, and notes."],
    ["Customer register", "Excel-like search", "Search by customer ID, name, email, or phone with clear account status and a 360 customer drill-down."],
    ["Invoicing", "Service-aware creation", "Numeric invoice IDs, service defaults, draft or send flow, and email delivery from the configured mailbox."],
    ["Transactions", "Inbox-backed capture", "Syncs emails with subject line 'You received money with Zelle' and stores the full structured transaction record."],
    ["Controls", "Exceptions and duplicates", "Duplicate protection, exception reassignment, raw extract review, and manual customer matching keep the ledger safe."],
    ["Communication", "PDF receipts", "Apply the transaction first, then send or re-send the PDF receipt separately from completed transactions."],
  ];
  items.forEach(([eyebrow, title, body], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 72 + col * 372;
    const y = 220 + row * 178;
    addRect(slide, { left: x, top: y, width: 336, height: 154, fill: colors.panelSoft, line: colors.line, radius: 1 });
    addText(slide, { text: eyebrow.toUpperCase(), left: x + 18, top: y + 18, width: 200, height: 14, fontSize: 11, color: colors.muted, bold: true });
    addText(slide, { text: title, left: x + 18, top: y + 42, width: 280, height: 24, fontSize: 17, color: colors.ink, bold: true });
    addText(slide, { text: body, left: x + 18, top: y + 74, width: 300, height: 58, fontSize: 14, color: colors.muted });
  });
  addFooter(slide, "Feature philosophy", "Build the finance operating system, not a point workflow", 5);
  return slide;
}

function slide6(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 6 · Controls", "Checks and balances are built into the operating model.");
  addBulletRow(slide, { x: 72, y: 228, w: 520, title: "Saved before applied", body: "Every synced transaction is captured as a durable record before finance posts it.", badge: "A", badgeFill: colors.accent });
  addBulletRow(slide, { x: 72, y: 320, w: 520, title: "Duplicates do not recount", body: "Message ID, transaction reference, and invoice-level checks keep the same payment from being counted twice.", badge: "B", badgeFill: colors.green });
  addBulletRow(slide, { x: 72, y: 412, w: 520, title: "Exceptions remain actionable", body: "Finance can manually match a transaction to an existing customer and move it forward safely.", badge: "C", badgeFill: colors.rose });
  addMetricCard(slide, { x: 640, y: 228, w: 178, h: 128, metric: "Audit trail", label: "Activity history shows when a payment was captured, applied, and when the receipt was sent." });
  addMetricCard(slide, { x: 842, y: 228, w: 178, h: 128, metric: "Separated actions", label: "Receipt send is a distinct button, which prevents accidental re-posting of money." });
  addMetricCard(slide, { x: 1044, y: 228, w: 178, h: 128, metric: "Historical integrity", label: "Service enrollments and referral rules are append-only or snapshot-based for reliable backtracking." });
  addQuote(slide, { x: 640, y: 392, w: 582, h: 122, text: "Operational speed matters, but the real product advantage is that every posted payment remains reviewable, explainable, and safe to revisit later.", accent: colors.accent });
  addFooter(slide, "Control model", "Operational speed with explainable financial decisions", 6);
  return slide;
}

function slide7(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 7 · Current State", "What is already live in the current product");
  const live = [
    "Authenticated portal",
    "Postgres system of record",
    "Gmail sync",
    "Completed transaction ledger",
    "Customer 360 view",
    "Dashboard trends",
  ];
  const bodies = [
    "Username/password gate protects access before finance data loads.",
    "Customers, invoices, payments, exceptions, referral logic, and activity history persist in a normalized database.",
    "The portal already reads the authorized mailbox and filters on the Zelle confirmation subject line.",
    "Applied payments remain visible with separate receipt-send status and timestamps.",
    "Operators can open one record and see signup date, contacts, services, invoice ledger, transaction history, referrals, and contract notes.",
    "Received amounts can be summarized by day, week, month, or year from saved applied transactions.",
  ];
  live.forEach((title, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    addCard(slide, {
      x: 72 + col * 372,
      y: 220 + row * 180,
      w: 336,
      h: 154,
      title,
      body: bodies[index],
      accent: [colors.accent, colors.green, colors.rose][index % 3],
    });
  });
  addFooter(slide, "Status", "Working prototype with real sync, real DB, and real outbound receipt delivery", 7);
  return slide;
}

function slide8(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 8 · Business Value", "Business value comes from compression of workflow, visibility, and control.");
  addMetricCard(slide, { x: 72, y: 232, w: 340, h: 168, metric: "Lower effort", label: "One portal replaces handoffs between spreadsheets, inbox searches, and scattered notes." });
  addMetricCard(slide, { x: 470, y: 232, w: 340, h: 168, metric: "Lower risk", label: "Human review, duplicate protection, and explainable transaction records reduce posting errors." });
  addMetricCard(slide, { x: 868, y: 232, w: 340, h: 168, metric: "Better experience", label: "Customers get faster confirmation through a structured invoice and receipt workflow." });
  addQuote(slide, { x: 72, y: 444, w: 1136, h: 120, text: "The strongest business case is not just faster invoicing. It is a controlled finance operations system that can scale with more customers, more products, and more payment volume without increasing chaos.", accent: colors.green });
  addFooter(slide, "Value lens", "Efficiency + trust + scalability", 8);
  return slide;
}

function slide9(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 9 · Architecture", "Low-cost AWS path without losing product behavior");
  const layers = [
    ["Frontend", "Host the portal on Amazon S3 with CloudFront for low fixed cost and simple HTTPS delivery."],
    ["API layer", "Move the current Node/Express backend to AWS App Runner for a low-ops managed runtime."],
    ["System of record", "Use Amazon RDS for PostgreSQL as the managed operational database."],
    ["Jobs and sync", "Use EventBridge, SQS, and Lambda for scheduled inbox sync, retryable processing, and async email jobs."],
    ["Email", "Use Amazon SES for lower-cost invoice and receipt sending once the product moves off Gmail SMTP."],
    ["Security and monitoring", "Keep secrets in Parameter Store or Secrets Manager and use CloudWatch for logs and alarms."],
  ];
  layers.forEach(([title, body], index) => {
    addRect(slide, { left: 72, top: 206 + index * 70, width: 1136, height: 56, fill: colors.panelSoft, line: colors.line, radius: 1 });
    addRect(slide, { left: 72, top: 206 + index * 70, width: 200, height: 56, fill: index % 2 === 0 ? colors.accentSoft : "#e5f0eb", line: "transparent", radius: 1 });
    addText(slide, { text: title, left: 92, top: 224 + index * 70, width: 160, height: 18, fontSize: 15, color: colors.ink, bold: true });
    addText(slide, { text: body, left: 292, top: 221 + index * 70, width: 880, height: 24, fontSize: 13, color: colors.muted });
  });
  addFooter(slide, "Deployment posture", "Managed, usage-aware, and ready for broader suite growth", 9);
  return slide;
}

function slide10(presentation) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.bg;
  addHeader(slide, "Slide 10 · Ask", "Use Setu Finance as the finance operations foundation for the next phase.", "It already demonstrates the critical workflow: onboard the customer, create and send the invoice, capture and review the payment, apply it safely, and send the receipt from one system of record.");
  addBulletRow(slide, { x: 72, y: 248, w: 710, title: "Approve the operating model", body: "Use the current portal as the blueprint for finance workflow design.", badge: "1", badgeFill: colors.accent });
  addBulletRow(slide, { x: 72, y: 342, w: 710, title: "Prioritize production hardening", body: "Focus next on deployment, admin tooling, and broader payment-source integrations.", badge: "2", badgeFill: colors.green });
  addBulletRow(slide, { x: 72, y: 436, w: 710, title: "Expand from portal to suite", body: "Use the customer, invoice, and transaction foundation to support adjacent products later.", badge: "3", badgeFill: colors.rose });
  addQuote(slide, { x: 836, y: 248, w: 372, h: 262, text: "Setu Finance is already more than a mockup. It is a working finance operations product with the right controls to become the backbone for a larger product suite.", accent: colors.accent });
  addFooter(slide, "Decision frame", "Adopt the workflow now, industrialize the stack next", 10);
  return slide;
}

async function main() {
  const out = path.join(workspace, "files", "setu_finance_pitch_deck.pptx");
  await fs.mkdir(path.dirname(out), { recursive: true });

  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  [
    slide1,
    slide2,
    slide3,
    slide4,
    slide5,
    slide6,
    slide7,
    slide8,
    slide9,
    slide10,
  ].forEach((builder) => builder(presentation));

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(out);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
