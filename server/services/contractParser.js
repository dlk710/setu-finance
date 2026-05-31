import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  describeService,
  findServiceDefinition,
  getServiceCatalog,
  normalizeServiceLabel,
} from "../../shared/serviceCatalog.js";

const CONTRACT_KIND_DEFINITIONS = {
  service_agreement: {
    code: "service_agreement",
    label: "Service agreement",
    prefillProfile: true,
    prefillBilling: true,
    rank: 30,
  },
  proposal: {
    code: "proposal",
    label: "Proposal",
    prefillProfile: true,
    prefillBilling: true,
    rank: 20,
  },
  nda: {
    code: "nda",
    label: "Confidentiality / NDA",
    prefillProfile: false,
    prefillBilling: false,
    rank: 0,
  },
  supporting: {
    code: "supporting",
    label: "Supporting document",
    prefillProfile: false,
    prefillBilling: false,
    rank: 0,
  },
};

function buildPreview(text, maxLength = 420) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No readable text could be extracted from this contract yet.";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value) {
  return normalizeWhitespace(value).replace(/\s+/g, " ").trim();
}

function formatDateOnly(value) {
  if (!value) {
    return null;
  }

  const sanitized = String(value)
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .trim();
  const parsed = new Date(sanitized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseCurrencyAmount(value) {
  if (!value) {
    return null;
  }

  const numeric = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric * 100) / 100;
}

function extractEmails(text) {
  return Array.from(
    String(text || "").matchAll(/[A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),
    (match) => match[0],
  );
}

function extractPhoneValue(text) {
  const match = String(text || "").match(
    /(\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/,
  );
  return match?.[0] ?? null;
}

function extractLabeledLineValue(text, labels) {
  const normalizedText = String(text || "");
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n\\r]+)`, "i");
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function containsNormalizedPhrase(haystack, needle) {
  const normalizedHaystack = normalizeWhitespace(String(haystack || "")).toLowerCase();
  const normalizedNeedle = normalizeWhitespace(String(needle || "")).toLowerCase();
  if (!normalizedNeedle) {
    return false;
  }
  return new RegExp(`(^|\\s)${normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(
    normalizedHaystack,
  );
}

function isLikelyPersonName(value) {
  const normalized = String(value || "")
    .replace(/[\[\]]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (/(presented by|created by|specialist|agreement|summary|client|consultant|signature)/i.test(normalized)) {
    return false;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 5) {
    return false;
  }

  return parts.every((part) => /^[A-Z][A-Za-z.'-]{1,24}$/.test(part));
}

function findPreparedForName(text) {
  const boundedMatch = String(text || "").match(
    /prepared for\s*\[?([A-Z][A-Za-z.' -]{2,80}?)\]?\s*(?:presented by|created by|inbound client specialist|agreement|summary|$)/i,
  );
  if (isLikelyPersonName(boundedMatch?.[1])) {
    return boundedMatch[1].replace(/\s{2,}/g, " ").trim();
  }

  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.replace(/[\[\]]/g, "").replace(/\s{2,}/g, " ").trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^prepared for\b/i.test(line)) {
      continue;
    }

    const inlineValue = line.replace(/^prepared for\b[:\s-]*/i, "").trim();
    if (isLikelyPersonName(inlineValue)) {
      return inlineValue;
    }

    for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 4); nextIndex += 1) {
      if (isLikelyPersonName(lines[nextIndex])) {
        return lines[nextIndex];
      }
    }
  }

  const inlineMatch = String(text || "").match(/prepared for\s*\[?([A-Z][A-Za-z.' -]{2,80})\]?/i);
  if (isLikelyPersonName(inlineMatch?.[1])) {
    return inlineMatch[1].replace(/\s{2,}/g, " ").trim();
  }

  return null;
}

function findAgreementCounterpartyName(text) {
  const patterns = [
    /\band\s+(?:mr\.?|ms\.?|mrs\.?)?\s*\[?([A-Z][A-Za-z.' -]{2,80})\]?\s*,?\s*(?:residing|\(the\s*[“"]?(?:client|receiving party)[”"]?\))/i,
    /\band\s+\[?([A-Z][A-Za-z.' -]{2,80})\]?\s*\(the\s*[“"]?client[”"]?\)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s{2,}/g, " ").trim();
    }
  }
  return null;
}

function parseDateFromFragment(value) {
  const raw = String(value || "")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .trim();
  if (!raw) {
    return null;
  }

  const monthPattern =
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},\s+\d{4}\b/i;
  const isoPattern = /\b\d{4}-\d{2}-\d{2}\b/;
  const slashPattern = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

  const match =
    raw.match(monthPattern)?.[0] ?? raw.match(isoPattern)?.[0] ?? raw.match(slashPattern)?.[0] ?? null;

  if (!match) {
    return null;
  }

  return formatDateOnly(match);
}

function extractLeadingDocumentDate(text) {
  const firstLine = String(text || "").split(/\n+/)[0] ?? "";
  return parseDateFromFragment(firstLine);
}

function extractServiceStartDateFromPhrases(text) {
  const patterns = [
    /\b(?:agreement|contract)\s+shall\s+begin\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
    /\bwork\s+will\s+be\s+started\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
    /\bservice\s+start(?:s|ing)?\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    const parsed = parseDateFromFragment(match?.[1] ?? null);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractContractDateFromPhrases(text) {
  const patterns = [
    /\bexecuted\s+on\s+this\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
    /\beffective\s+date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
    /\bdated\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    const parsed = parseDateFromFragment(match?.[1] ?? null);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractDateAfterLabels(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n\\r]+)`, "i");
    const match = String(text || "").match(pattern);
    const parsed = parseDateFromFragment(match?.[1] ?? "");
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function extractClientName(text) {
  const preparedFor = findPreparedForName(text);
  if (preparedFor) {
    return preparedFor;
  }

  const labeled = extractLabeledLineValue(text, [
    "client name",
    "customer name",
    "name of client",
    "member name",
    "client",
  ]);

  if (labeled) {
    return labeled.replace(/\s{2,}/g, " ").trim();
  }

  const agreementCounterparty = findAgreementCounterpartyName(text);
  if (agreementCounterparty) {
    return agreementCounterparty;
  }

  const paragraphMatch = String(text || "").match(
    /\bthis agreement is between\s+([A-Za-z][A-Za-z.' -]{2,80})\s+and\b/i,
  );
  return paragraphMatch?.[1]?.trim() ?? null;
}

function extractCustomerEmail(text) {
  const labeled = extractLabeledLineValue(text, [
    "client email",
    "customer email",
    "email of client",
    "email",
  ]);
  const labeledEmail = labeled ? extractEmails(labeled)[0] ?? null : null;
  if (labeledEmail && !/@ascendhsi\.com$/i.test(labeledEmail)) {
    return labeledEmail;
  }
  return null;
}

function extractCustomerPhone(text) {
  const labeled = extractLabeledLineValue(text, [
    "client phone",
    "customer phone",
    "mobile phone",
    "phone",
  ]);
  return labeled ? extractPhoneValue(labeled) : null;
}

function extractTotalFee(text) {
  const patterns = [
    /total\s+ascend\s+fee[^$\n\r]{0,40}\$([0-9,]+(?:\.[0-9]{2})?)/i,
    /(?:total|professional|legal|engagement|program)\s+fee[^$\n\r]{0,40}\$([0-9,]+(?:\.[0-9]{2})?)/i,
    /(?:fee|price|cost|package)[^$\n\r]{0,30}\$([0-9,]+(?:\.[0-9]{2})?)/i,
    /(?:drafting\s*&\s*filing|lor\s+assistance\s+package)[^$\n\r]{0,40}\$([0-9,]+(?:\.[0-9]{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = String(text || "").match(pattern);
    const amount = parseCurrencyAmount(match?.[1]);
    if (amount !== null) {
      return amount;
    }
  }

  return null;
}

function detectBillingCadence({ installments, serviceStartDate }) {
  if (!installments.length) {
    return "";
  }

  if (installments.length === 1) {
    return "per_milestone";
  }

  const withDates = installments
    .map((item) => formatDateOnly(item.dueDate))
    .filter(Boolean)
    .map((item) => new Date(`${item}T12:00:00`));
  if (withDates.length >= 2) {
    const diffs = [];
    for (let index = 1; index < withDates.length; index += 1) {
      diffs.push(
        Math.round((withDates[index].getTime() - withDates[index - 1].getTime()) / (1000 * 60 * 60 * 24)),
      );
    }
    const avg = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
    if (avg >= 26 && avg <= 35) {
      return "monthly";
    }
  }

  return serviceStartDate ? "custom" : "per_milestone";
}

function detectFeeType({ billingCadence, installments = [], text = "" }) {
  const normalizedCadence = String(billingCadence || "").trim().toLowerCase();
  if (normalizedCadence === "monthly") {
    return "recurring";
  }

  const normalizedText = normalizeInlineText(text).toLowerCase();
  if (
    /\b(recurring|subscription|monthly fee|monthly billing|ongoing monthly|auto-renew)\b/i.test(
      normalizedText,
    )
  ) {
    return "recurring";
  }

  if (normalizedCadence === "per_milestone" || normalizedCadence === "custom") {
    return "one_time";
  }

  if ((Array.isArray(installments) ? installments : []).length > 1) {
    return "one_time";
  }

  return "one_time";
}

function extractBillingCadence(text) {
  const labeled = extractLabeledLineValue(text, [
    "billing cadence",
    "billing schedule",
    "payment cadence",
    "payment schedule",
  ]);
  const normalized = String(labeled || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("milestone")) {
    return "per_milestone";
  }

  if (normalized.includes("month")) {
    return "monthly";
  }

  if (normalized.includes("custom")) {
    return "custom";
  }

  return "";
}

function splitIntoCandidateLines(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  const rawLines = normalized
    .split(/\n+/)
    .flatMap((line) =>
      line
        .split(/(?=(?:installment|milestone|payment)\s+\d+)/gi)
        .flatMap((part) => part.split(/(?=\b\d+\.\s)/g))
        .flatMap((part) => part.split(/(?=●\s)/g)),
    )
    .map((line) => line.trim())
    .filter(Boolean);

  return rawLines;
}

function classifyContractDocument({ fileName, text }) {
  const normalized = normalizeInlineText(`${String(fileName || "")}\n${String(text || "")}`).toLowerCase();

  if (
    normalized.includes("retainer agreement") ||
    normalized.includes("drafting & filing agreement") ||
    normalized.includes("drafting and filing agreement") ||
    normalized.includes("service agreement")
  ) {
    return CONTRACT_KIND_DEFINITIONS.service_agreement;
  }

  if (normalized.includes("proposal") || normalized.includes("work summary")) {
    return CONTRACT_KIND_DEFINITIONS.proposal;
  }

  if (
    normalized.includes("confidentiality") ||
    normalized.includes("non-disclosure") ||
    normalized.includes("non disclosure") ||
    normalized.includes("data privacy")
  ) {
    return CONTRACT_KIND_DEFINITIONS.nda;
  }

  return CONTRACT_KIND_DEFINITIONS.supporting;
}

function extractContractSpecificServices(text, contractKind) {
  const normalized = normalizeInlineText(String(text || "")).toLowerCase();
  const services = [];

  if (normalized.includes("lor assistance package")) {
    services.push("LOR package");
  }

  if (normalized.includes("drafting & filing") || normalized.includes("drafting and filing")) {
    services.push("Drafting & filing");
  }

  if (
    contractKind.code !== "nda" &&
    (normalized.includes("original contribution criteria") || normalized.includes("original contribution"))
  ) {
    services.push("Contributions");
  }

  return Array.from(new Set(services)).map((serviceName) => {
    const description = describeService(serviceName);
    return {
      code: description.code,
      name: description.shortLabel,
      longLabel: description.longLabel,
      isCustom: description.isCustom,
    };
  });
}

function findServiceMention(text) {
  const catalog = getServiceCatalog();
  const normalized = String(text || "").toLowerCase();
  for (const definition of catalog) {
    const candidates = [
      definition.shortLabel,
      definition.longLabel,
      ...(definition.aliases ?? []),
    ];
    if (candidates.some((candidate) => containsNormalizedPhrase(normalized, candidate))) {
      return definition.shortLabel;
    }
  }
  return null;
}

function extractServiceMentions(text) {
  const contractKind = classifyContractDocument({ text });
  if (!contractKind.prefillProfile) {
    return [];
  }

  const catalog = getServiceCatalog();
  const scopedText = String(text || "").slice(0, 2200);
  const normalized = scopedText.toLowerCase();
  const matches = [];

  for (const definition of catalog) {
    const candidates = [
      definition.shortLabel,
      definition.longLabel,
      ...(definition.aliases ?? []),
    ];
    if (candidates.some((candidate) => containsNormalizedPhrase(normalized, candidate))) {
      matches.push({
        code: definition.code,
        name: definition.shortLabel,
        longLabel: definition.longLabel,
        isCustom: false,
      });
    }
  }

  const specific = extractContractSpecificServices(scopedText, contractKind);
  const combined = Array.from(
    new Map(
      [...specific, ...matches].map((service) => [service.code ?? service.name, service]),
    ).values(),
  );

  if (combined.some((service) => service.code === "drafting-filing")) {
    return combined.filter((service) => service.code !== "filing-support");
  }

  return combined;
}

function extractInstallments(text, { services, totalFee, serviceStartDate, contractKind }) {
  if (!contractKind?.prefillBilling) {
    return [];
  }

  const lines = splitIntoCandidateLines(text);
  const entries = [];

  for (const line of lines) {
    if (
      /(government fees?|premium processing|i-140|i-485|late payment|penalty|asylum program|responsibility of the client)/i.test(
        line,
      )
    ) {
      continue;
    }

    if (
      !/\$[0-9]/.test(line) ||
      !/(installment\s*\d+|final installment|milestone\s*\d+|payment\s*\d+|phase\s*\d+|due date|initiation fee|administrative fee|package)/i.test(
        line,
      )
    ) {
      continue;
    }

    const amountMatch = line.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
    const amount = parseCurrencyAmount(amountMatch?.[1]);
    if (amount === null) {
      continue;
    }

    const dueDate = parseDateFromFragment(line) ?? serviceStartDate ?? null;
    const labelMatch = line.match(
      /\b((?:initiation fee|administrative fee|final installment|installment|milestone|payment|phase|package)\s*(?:#)?\s*\d*[^$]*)/i,
    );
    let label = labelMatch?.[1]?.replace(/\s+/g, " ").trim() ?? `Installment ${entries.length + 1}`;
    if (/administrative fee/i.test(label)) {
      label = "Administrative fee";
    } else if (/initiation fee/i.test(label)) {
      label = "Initiation fee";
    } else if (/final installment/i.test(label)) {
      label = "Final installment";
    } else if (/package/i.test(label) && services[0]?.name) {
      label = `${normalizeServiceLabel(services[0].name)} fee`;
    }
    const matchedService = services[0]?.name ?? findServiceMention(line) ?? "General service";

    entries.push({
      label,
      serviceName: normalizeServiceLabel(matchedService),
      milestone: label,
      amount,
      discountPct: 0,
      dueDate,
    });
  }

  const uniqueEntries = [];
  for (const entry of entries) {
    const existingIndex = uniqueEntries.findIndex((candidate) => {
      const sameAmount = Number(candidate.amount || 0) === Number(entry.amount || 0);
      const sameDate = (candidate.dueDate ?? "") === (entry.dueDate ?? "");
      const sameService = normalizeServiceLabel(candidate.serviceName) === normalizeServiceLabel(entry.serviceName);
      const normalizedCandidateLabel = candidate.label.toLowerCase();
      const normalizedEntryLabel = entry.label.toLowerCase();
      const sameLabel =
        normalizedCandidateLabel === normalizedEntryLabel ||
        normalizedCandidateLabel.includes(normalizedEntryLabel) ||
        normalizedEntryLabel.includes(normalizedCandidateLabel);
      return sameAmount && sameDate && sameService && sameLabel;
    });

    if (existingIndex === -1) {
      uniqueEntries.push(entry);
      continue;
    }

    if (entry.label.length < uniqueEntries[existingIndex].label.length) {
      uniqueEntries[existingIndex] = entry;
    }
  }

  if (!uniqueEntries.length && totalFee !== null) {
    uniqueEntries.push({
      label: "Contract fee",
      serviceName: services[0]?.name ?? "General service",
      milestone: "Contract fee",
      amount: totalFee,
      discountPct: 0,
      dueDate: serviceStartDate ?? null,
    });
  }

  return uniqueEntries;
}

function normalizeStructuredInstallments(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((entry, index) => {
      const amount = parseCurrencyAmount(entry?.amount);
      if (amount === null) {
        return null;
      }

      const serviceName = normalizeServiceLabel(entry?.serviceName ?? entry?.service ?? "General service");
      return {
        label: String(entry?.label || entry?.milestone || `Installment ${index + 1}`).trim(),
        serviceName,
        milestone: String(entry?.milestone || entry?.label || `Installment ${index + 1}`).trim(),
        amount,
        discountPct: Number(entry?.discountPct || 0) || 0,
        dueDate: formatDateOnly(entry?.dueDate) ?? null,
      };
    })
    .filter(Boolean);
}

function parseStructuredContract(jsonValue = {}) {
  const contractKind = classifyContractDocument({
    fileName: jsonValue.fileName ?? "",
    text: JSON.stringify(jsonValue),
  });
  const clientName =
    jsonValue.clientName ??
    jsonValue.customerName ??
    jsonValue.client?.name ??
    null;
  const email =
    jsonValue.customerEmail ??
    jsonValue.email ??
    jsonValue.client?.email ??
    null;
  const phone =
    jsonValue.customerPhone ??
    jsonValue.phone ??
    jsonValue.client?.phone ??
    null;
  const serviceStartDate =
    formatDateOnly(
      jsonValue.serviceStartDate ??
        jsonValue.startDate ??
        jsonValue.service?.startDate ??
        jsonValue.contract?.serviceStartDate,
    ) ?? null;
  const contractDate =
    formatDateOnly(
      jsonValue.contractDate ??
        jsonValue.agreementDate ??
        jsonValue.startDate ??
        jsonValue.contract?.date,
    ) ?? null;
  const services = (Array.isArray(jsonValue.services) ? jsonValue.services : [])
    .map((service) => {
      const definition = describeService(service?.name ?? service?.label ?? service);
      return {
        code: definition.code,
        name: definition.shortLabel,
        longLabel: definition.longLabel,
        isCustom: definition.isCustom,
      };
    })
    .filter((service) => service.name);
  const totalFee = parseCurrencyAmount(jsonValue.totalFee ?? jsonValue.fee ?? jsonValue.contract?.totalFee);
  const installments = normalizeStructuredInstallments(jsonValue.installments ?? jsonValue.invoiceSchedule ?? []);
  const billingCadence =
    String(jsonValue.billingCadence || "").trim() ||
    detectBillingCadence({
      installments,
      serviceStartDate,
    });
  const feeType =
    String(jsonValue.feeType || "").trim() ||
    detectFeeType({
      billingCadence,
      installments,
      text: JSON.stringify(jsonValue),
    });
  return {
    contractKind: contractKind.code,
    contractKindLabel: contractKind.label,
    prefillProfile: contractKind.prefillProfile,
    prefillBilling: contractKind.prefillBilling,
    prefillRank: contractKind.rank,
    clientName,
    customerEmail: email,
    customerPhone: phone,
    serviceStartDate,
    contractDate,
    services,
    totalFee,
    feeType,
    installments: installments.length
      ? installments
      : extractInstallments("", { services, totalFee, serviceStartDate, contractKind }),
    billingCadence,
  };
}

async function extractPdfText(buffer) {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const groupedLines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of content.items) {
      if (!item?.str) {
        continue;
      }

      const y = Number(item.transform?.[5] ?? 0);
      if (currentLine.length && currentY !== null && Math.abs(y - currentY) > 2.5) {
        const line = currentLine.join(" ").replace(/\s{2,}/g, " ").trim();
        if (line) {
          groupedLines.push(line);
        }
        currentLine = [item.str];
        currentY = y;
        continue;
      }

      currentLine.push(item.str);
      currentY = currentY === null ? y : currentY;
    }

    if (currentLine.length) {
      const line = currentLine.join(" ").replace(/\s{2,}/g, " ").trim();
      if (line) {
        groupedLines.push(line);
      }
    }

    if (groupedLines.length) {
      pages.push(groupedLines.join("\n"));
    }
  }

  return pages.join("\n\n");
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

async function extractContractText({ mimeType, buffer, fileName }) {
  const lowerMime = String(mimeType || "").toLowerCase();
  const lowerName = String(fileName || "").toLowerCase();

  if (lowerMime.includes("application/json") || lowerName.endsWith(".json")) {
    return buffer.toString("utf8");
  }

  if (
    lowerMime.includes("text/plain") ||
    lowerMime.includes("text/markdown") ||
    lowerMime.includes("text/html") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".html")
  ) {
    return buffer.toString("utf8");
  }

  if (
    lowerMime.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
    lowerName.endsWith(".docx")
  ) {
    return extractDocxText(buffer);
  }

  if (lowerMime.includes("application/pdf") || lowerName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  throw new Error("Unsupported contract file type. Upload PDF, DOCX, TXT, HTML, or JSON.");
}

function parseContractText(text) {
  const normalizedText = normalizeWhitespace(text);
  const contractKind = classifyContractDocument({ text: normalizedText });
  const clientName = extractClientName(normalizedText);
  const serviceStartDate = extractDateAfterLabels(normalizedText, [
    "service start date",
    "start date",
    "engagement start",
    "effective date",
  ]) ?? extractServiceStartDateFromPhrases(normalizedText);
  const contractDate = extractDateAfterLabels(normalizedText, [
    "contract date",
    "agreement date",
    "date of agreement",
    "effective date",
  ]) ?? extractContractDateFromPhrases(normalizedText) ?? extractLeadingDocumentDate(normalizedText);
  const services = extractServiceMentions(normalizedText);
  const totalFee = extractTotalFee(normalizedText);
  const installments = extractInstallments(normalizedText, {
    services,
    totalFee,
    serviceStartDate,
    contractKind,
  });
  const billingCadence =
    extractBillingCadence(normalizedText) ||
    detectBillingCadence({
      installments,
      serviceStartDate,
    });
  const feeType = detectFeeType({
    billingCadence,
    installments,
    text: normalizedText,
  });

  return {
    contractKind: contractKind.code,
    contractKindLabel: contractKind.label,
    prefillProfile: contractKind.prefillProfile,
    prefillBilling: contractKind.prefillBilling,
    prefillRank: contractKind.rank,
    clientName,
    customerEmail: extractCustomerEmail(normalizedText),
    customerPhone: extractCustomerPhone(normalizedText),
    serviceStartDate,
    contractDate,
    services,
    totalFee,
    feeType,
    installments,
    billingCadence,
  };
}

export { classifyContractDocument };

export async function parseContractUpload({ fileName, mimeType, buffer }) {
  const extractedText = await extractContractText({ fileName, mimeType, buffer });
  const normalizedText = normalizeWhitespace(extractedText);

  let parsed;
  try {
    const maybeJson = JSON.parse(buffer.toString("utf8"));
    parsed = parseStructuredContract(maybeJson);
  } catch {
    parsed = parseContractText(normalizedText);
  }

  const fallbackServices = (parsed.services ?? []).length
    ? parsed.services
    : normalizedText
      ? extractServiceMentions(normalizedText)
      : [];

  const normalizedInstallments = normalizeStructuredInstallments(parsed.installments ?? []);
  const normalizedTotalFee =
    parsed.totalFee ??
    (normalizedInstallments.length
      ? Math.round(
          normalizedInstallments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) * 100,
        ) / 100
      : null);

  return {
    fileName,
    mimeType,
    sizeBytes: buffer.length,
    extractedTextPreview: buildPreview(normalizedText),
    parsed: {
      contractKind: parsed.contractKind ?? null,
      contractKindLabel: parsed.contractKindLabel ?? null,
      prefillProfile: Boolean(parsed.prefillProfile),
      prefillBilling: Boolean(parsed.prefillBilling),
      prefillRank: Number(parsed.prefillRank || 0),
      clientName: parsed.clientName ?? null,
      customerEmail: parsed.customerEmail ?? null,
      customerPhone: parsed.customerPhone ?? null,
      serviceStartDate: parsed.serviceStartDate ?? null,
      contractDate: parsed.contractDate ?? null,
      services: fallbackServices.map((service) => {
        const description = describeService(service.name ?? service.shortLabel ?? service.longLabel ?? service);
        return {
          code: service.code ?? description.code,
          name: description.shortLabel,
          longLabel: description.longLabel,
          isCustom: service.isCustom ?? description.isCustom,
        };
      }),
      totalFee: normalizedTotalFee,
      feeType: parsed.feeType ?? "one_time",
      billingCadence: parsed.billingCadence ?? "",
      installments:
        normalizedInstallments.length
          ? normalizedInstallments
          : extractInstallments(normalizedText, {
              services: fallbackServices,
              totalFee: normalizedTotalFee,
              serviceStartDate: parsed.serviceStartDate ?? null,
              contractKind: {
                prefillBilling: Boolean(parsed.prefillBilling),
              },
            }),
    },
  };
}
