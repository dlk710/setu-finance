import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  describeService,
  findServiceDefinition,
  getServiceCatalog,
  normalizeServiceLabel,
} from "../../shared/serviceCatalog.js";

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

function formatDateOnly(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
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

function extractEmail(text) {
  const match = String(text || "").match(/[A-Z0-9._%*+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function extractPhone(text) {
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

function parseDateFromFragment(value) {
  const raw = String(value || "").trim();
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

  const paragraphMatch = String(text || "").match(
    /\bthis agreement is between\s+([A-Za-z][A-Za-z.' -]{2,80})\s+and\b/i,
  );
  return paragraphMatch?.[1]?.trim() ?? null;
}

function extractTotalFee(text) {
  const patterns = [
    /(?:total|professional|legal|engagement|program)\s+fee[^$\n\r]{0,40}\$([0-9,]+(?:\.[0-9]{2})?)/i,
    /(?:fee|price)[^$\n\r]{0,25}\$([0-9,]+(?:\.[0-9]{2})?)/i,
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
      line.split(/(?=(?:installment|milestone|payment)\s+\d+)/gi),
    )
    .map((line) => line.trim())
    .filter(Boolean);

  return rawLines;
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
    if (candidates.some((candidate) => normalized.includes(String(candidate).toLowerCase()))) {
      return definition.shortLabel;
    }
  }
  return null;
}

function extractServiceMentions(text) {
  const catalog = getServiceCatalog();
  const normalized = String(text || "").toLowerCase();
  const matches = [];

  for (const definition of catalog) {
    const candidates = [
      definition.shortLabel,
      definition.longLabel,
      ...(definition.aliases ?? []),
    ];
    if (candidates.some((candidate) => normalized.includes(String(candidate).toLowerCase()))) {
      matches.push({
        code: definition.code,
        name: definition.shortLabel,
        longLabel: definition.longLabel,
        isCustom: false,
      });
    }
  }

  return matches;
}

function extractInstallments(text, { services, totalFee, serviceStartDate }) {
  const lines = splitIntoCandidateLines(text);
  const entries = [];

  for (const line of lines) {
    if (!/\$[0-9]/.test(line) || !/(installment|milestone|payment|due)/i.test(line)) {
      continue;
    }

    const amountMatch = line.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
    const amount = parseCurrencyAmount(amountMatch?.[1]);
    if (amount === null) {
      continue;
    }

    const dueDate = parseDateFromFragment(line) ?? serviceStartDate ?? null;
    const labelMatch = line.match(
      /\b((?:installment|milestone|payment)\s*(?:#)?\s*\d+[^$]*)/i,
    );
    const label = labelMatch?.[1]?.replace(/\s+/g, " ").trim() ?? `Installment ${entries.length + 1}`;
    const matchedService = findServiceMention(line) ?? services[0]?.name ?? "General service";

    entries.push({
      label,
      serviceName: normalizeServiceLabel(matchedService),
      milestone: label,
      amount,
      discountPct: 0,
      dueDate,
    });
  }

  const uniqueEntries = entries.filter((entry, index, current) => {
    const key = `${entry.label}|${entry.amount}|${entry.dueDate ?? ""}`;
    return current.findIndex((candidate) => `${candidate.label}|${candidate.amount}|${candidate.dueDate ?? ""}` === key) === index;
  });

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
  return {
    clientName,
    customerEmail: email,
    customerPhone: phone,
    serviceStartDate,
    contractDate,
    services,
    totalFee,
    installments: installments.length
      ? installments
      : extractInstallments("", { services, totalFee, serviceStartDate }),
    billingCadence:
      String(jsonValue.billingCadence || "").trim() ||
      detectBillingCadence({
        installments,
        serviceStartDate,
      }),
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
    const lines = content.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (lines) {
      pages.push(lines);
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
  const clientName = extractClientName(normalizedText);
  const serviceStartDate = extractDateAfterLabels(normalizedText, [
    "service start date",
    "start date",
    "engagement start",
    "effective date",
  ]);
  const contractDate = extractDateAfterLabels(normalizedText, [
    "contract date",
    "agreement date",
    "date of agreement",
    "effective date",
  ]);
  const services = extractServiceMentions(normalizedText);
  const totalFee = extractTotalFee(normalizedText);
  const installments = extractInstallments(normalizedText, {
    services,
    totalFee,
    serviceStartDate,
  });
  const billingCadence =
    extractBillingCadence(normalizedText) ||
    detectBillingCadence({
      installments,
      serviceStartDate,
    });

  return {
    clientName,
    customerEmail: extractEmail(normalizedText),
    customerPhone: extractPhone(normalizedText),
    serviceStartDate,
    contractDate,
    services,
    totalFee,
    installments,
    billingCadence,
  };
}

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

  return {
    fileName,
    mimeType,
    sizeBytes: buffer.length,
    extractedTextPreview: buildPreview(normalizedText),
    parsed: {
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
      totalFee: parsed.totalFee ?? null,
      billingCadence: parsed.billingCadence ?? "",
      installments:
        normalizedInstallments.length
          ? normalizedInstallments
          : extractInstallments(normalizedText, {
              services: fallbackServices,
              totalFee: parsed.totalFee ?? null,
              serviceStartDate: parsed.serviceStartDate ?? null,
            }),
    },
  };
}
