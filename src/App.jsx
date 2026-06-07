import { useEffect, useId, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconCircleCheckFilled,
  IconFileInvoice,
  IconHelpCircle,
  IconLayoutDashboard,
  IconMail,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTable,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { createInitialState, createInvoiceRefPreview } from "./data/mockData";
import {
  ASK_SETU_SUGGESTIONS,
  buildAskSetuAnswer,
} from "./lib/askSetu";
import {
  buildReferralTrend,
  buildTransactionTrend,
  calculateZelleAmount,
  formatCompactCurrency,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  highlightMatch,
  makeInvoiceCode,
  searchCustomersByIdentity,
  searchCustomers,
  summarizeContacts,
} from "./lib/finance";
import {
  apiRequest,
  loadApiState,
  loadAuthStatus,
  loadPublicReferralProgram,
  submitPublicFeedback,
  submitPublicReferral,
} from "./lib/api";
import {
  describeService,
  getCriteriaCatalog,
  normalizeServiceLabel,
  summarizeServiceLabels,
} from "../shared/serviceCatalog.js";

const DEFAULT_FORM = {
  selectedCustomerId: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  selectedEmail: "",
  service: "Authorship",
  milestone: "",
  amount: 1500,
  discountPct: 5,
  dueDate: "2026-06-10",
};
const MANUAL_PAYMENT_ROUTES = [
  { value: "manual_zelle", label: "Zelle verified outside Gmail sync" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card processor" },
  { value: "other", label: "Other secured route" },
];

function createDefaultManualPaymentForm() {
  return {
    selectedCustomerId: "",
    amountReceived: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    paymentRoute: "manual_zelle",
    transactionReference: "",
    invoiceId: "",
    memo: "",
    notes: "",
  };
}

const EB1A_CRITERIA_OPTIONS = getCriteriaCatalog().map((definition) => ({
  code: definition.code,
  label: definition.shortLabel,
  longLabel: definition.longLabel,
}));

const DEFAULT_SERVICE_OPTIONS = [
  ...EB1A_CRITERIA_OPTIONS.map((option) => option.label),
  "Custom",
];

const DEFAULT_AUTH_FORM = {
  username: "admin",
  password: "",
};

const PORTAL_VIEW_PATHS = {
  portalHome: "/",
  publicReferral: "/refer",
  publicFeedback: "/feedback",
  clients: "/clients",
  receivables: "/receivables",
  referrals: "/referrals",
  payables: "/payables",
  people: "/people",
  audit: "/audit",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  console: "/billing",
  search: "/customers",
  admin: "/admin",
  settings: "/settings",
};

const SETU_PORTALS = [
  {
    id: "finance",
    setuLabel: "setu",
    label: "Finance",
    tagline: "Contract-to-cash · billing & status",
    accent: "#5F7A6B",
    tint: "#E6ECE8",
    view: "dashboard",
    status: "Live",
    icon: IconTrendingUp,
  },
  {
    id: "discover",
    setuLabel: "setu",
    label: "Discover",
    tagline: "Opportunity Studio · find & match",
    accent: "#C68A3E",
    tint: "#F3E7D8",
    status: "Coming soon",
    icon: IconHelpCircle,
  },
  {
    id: "customer",
    setuLabel: "setu",
    label: "Customer",
    tagline: "Member portal · profiles & evidence",
    accent: "#6E89A6",
    tint: "#E6ECF2",
    status: "Coming soon",
    icon: IconUsers,
  },
  {
    id: "media",
    setuLabel: "setu",
    label: "Media",
    tagline: "Press portal · articles & proofs",
    accent: "#A35E72",
    tint: "#EFE3E7",
    status: "Coming soon",
    icon: IconFileInvoice,
  },
  {
    id: "referral",
    setuLabel: "setu",
    label: "Referral",
    tagline: "Referral Engine · grow the book",
    accent: "#8A9A5B",
    tint: "#ECF0E2",
    view: "publicReferral",
    status: "Live",
    icon: IconTable,
  },
];

const FINANCE_PORTAL = SETU_PORTALS[0];
const REFERRAL_PORTAL = SETU_PORTALS.find((portal) => portal.id === "referral");

const FINANCE_NAV_SECTIONS = [
  {
    section: "executive",
    label: "Executive",
    view: "dashboard",
    icon: IconLayoutDashboard,
    marker: "new",
    helper: "Company summary",
  },
  {
    section: "clients",
    label: "Clients",
    view: "clients",
    icon: IconUsers,
    marker: "existing",
    helper: "Onboard + register",
  },
  {
    section: "receivables",
    label: "Receivables",
    view: "receivables",
    icon: IconFileInvoice,
    marker: "existing",
    helper: "Invoices + Zelle",
  },
  {
    section: "payables",
    label: "Payables",
    view: "payables",
    icon: IconFileInvoice,
    marker: "new",
    helper: "Money out",
  },
  {
    section: "referrals",
    label: "Referrals",
    view: "referrals",
    icon: IconTable,
    marker: "extended",
    helper: "Intake + rewards",
  },
  {
    section: "people",
    label: "People",
    view: "people",
    icon: IconUsers,
    marker: "new",
    helper: "Org directory",
  },
  {
    section: "settings",
    label: "Settings",
    view: "settings",
    icon: IconSettings,
    marker: "extended",
    helper: "Access + sync",
  },
  {
    section: "audit",
    label: "Audit",
    view: "audit",
    icon: IconTable,
    marker: "extended",
    helper: "Events + history",
  },
];

function getFinanceSection(view) {
  if (view === "clients" || view === "onboarding" || view === "search" || view === "customer360") {
    return "clients";
  }
  if (view === "receivables" || view === "console") {
    return "receivables";
  }
  if (view === "referrals" || view === "admin") {
    return "referrals";
  }
  if (view === "payables") {
    return "payables";
  }
  if (view === "people") {
    return "people";
  }
  if (view === "settings") {
    return "settings";
  }
  if (view === "audit") {
    return "audit";
  }
  return "executive";
}

function getFinanceShellCopy({ view, customer }) {
  const section = getFinanceSection(view);
  const defaults = {
    executive: ["Executive", FINANCE_PORTAL.tagline],
    clients: ["Clients", "Contract-first onboarding, searchable register, and 360 views"],
    receivables: ["Receivables", "Invoices, Zelle/Gmail sync, payment confirmation, exceptions, and receipts"],
    payables: ["Payables", "Referral bonuses and future money-out queues"],
    referrals: ["Referrals", "Referral intake, relationships, rewards, and feedback"],
    people: ["People", "Future employee and sales referrer directory"],
    settings: ["Settings", "Access, Gmail sync, outbound email, and referral rules"],
    audit: ["Audit", "Referral events, finance activity, and resolved exception history"],
  };

  if (view === "customer360" && customer) {
    return ["Customer 360", `${customer.name} · ${customer.customerCode ?? customer.id}`];
  }
  if (view === "onboarding") {
    return ["Client onboarding", "Upload contracts first, then confirm services, fees, and billing schedule"];
  }
  if (view === "search") {
    return ["Customer register", "Excel-like search across customer ID, name, email, phone, and service"];
  }

  return defaults[section] ?? defaults.executive;
}

function createPortalRoute(view = "dashboard", customerId = "", referrerCode = "") {
  return {
    view,
    customerId,
    referrerCode,
  };
}

function buildPortalPath(route) {
  if (route?.view === "customer360" && route.customerId) {
    return `/customers/${encodeURIComponent(route.customerId)}`;
  }

  if (route?.view === "publicReferral" && route.referrerCode) {
    return `/refer/${encodeURIComponent(route.referrerCode)}`;
  }

  return PORTAL_VIEW_PATHS[route?.view] ?? PORTAL_VIEW_PATHS.dashboard;
}

function parsePortalRoute(pathname = "/") {
  const normalizedPath = String(pathname || "/").replace(/\/+$/, "") || "/";
  const referralGatewayMatch = normalizedPath.match(/^\/(?:refer|referral-gateway|r)\/([^/]+)$/);
  if (referralGatewayMatch) {
    return createPortalRoute("publicReferral", "", decodeURIComponent(referralGatewayMatch[1]));
  }

  const customerMatch = normalizedPath.match(/^\/customers\/([^/]+)$/);
  if (customerMatch) {
    return createPortalRoute("customer360", decodeURIComponent(customerMatch[1]));
  }

  const entry = Object.entries(PORTAL_VIEW_PATHS).find(([, path]) => path === normalizedPath);
  if (entry) {
    return createPortalRoute(entry[0]);
  }

  return createPortalRoute("dashboard");
}

function getBrowserTitle(route, customer = null) {
  if (route?.view === "portalHome") {
    return "setu - Portals";
  }
  if (route?.view === "publicReferral") {
    return route.referrerCode ? `setu - Referral ${route.referrerCode}` : "setu - Referral";
  }
  if (route?.view === "publicFeedback") {
    return "setu - Feedback";
  }
  if (route?.view === "customer360" && customer?.name) {
    return `setu - Finance - ${customer.name}`;
  }
  return "setu - Finance";
}

function createAskSetuMessage(role, text) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
  };
}

function SetuBridgeMark() {
  return (
    <svg className="setu-bridge-mark" viewBox="0 0 64 30" aria-hidden="true">
      <path d="M7 22H57" />
      <path d="M16 22C21 10 42 10 48 22" />
      <path d="M18 22V15" />
      <path d="M32 22V10" />
      <path d="M46 22V15" />
      <path d="M8 22L14 16" />
      <path d="M56 22L50 16" />
    </svg>
  );
}

function SetuFinanceLogo({ className = "", home = false, onClick = null, portalName = "", tagline = "" }) {
  const logoContent = (
    <>
      <span className="brand-stack">
        <span className="brand-row">
          <SetuBridgeMark />
          <span className="letters">setu</span>
        </span>
        {portalName ? <span className="brand-subtitle">{portalName}</span> : null}
        {tagline ? <span className="brand-tagline">{tagline}</span> : null}
      </span>
    </>
  );

  if (home) {
    return (
      <button className={`wordmark setu-finance-logo logo-home ${className}`} onClick={onClick} type="button">
        {logoContent}
      </button>
    );
  }

  return <span className={`wordmark setu-finance-logo ${className}`}>{logoContent}</span>;
}

function createAskSetuWelcomeMessage() {
  return createAskSetuMessage(
    "assistant",
    "Ask Setu can answer quick questions from the live portal state. Try payments to confirm, due invoices, customer summaries, Gmail sync, or outbound email status.",
  );
}

function createDateTimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function createServiceSelectionEntry(code, enrolledAt = createDateTimeLocalValue()) {
  return {
    code,
    enrolledAt,
  };
}

function createCustomServiceEntry() {
  return {
    id: crypto.randomUUID(),
    name: "",
    enrolledAt: createDateTimeLocalValue(),
  };
}

function createInvoiceScheduleEntry(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    label: overrides.label ?? "",
    serviceName: overrides.serviceName ?? "Authorship",
    milestone: overrides.milestone ?? "",
    amount: overrides.amount ?? 0,
    discountPct: overrides.discountPct ?? 0,
    dueDate: overrides.dueDate ?? new Date().toISOString().slice(0, 10),
  };
}

function shiftDateByCadence(value, cadence) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  if (cadence === "monthly") {
    base.setMonth(base.getMonth() + 1);
  }

  return base.toISOString().slice(0, 10);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

const DEFAULT_ONBOARDING_FORM = {
  selectedCustomerId: "",
  referringCustomerId: "",
  referralRelationship: "",
  firstName: "",
  lastName: "",
  customerEmail: "",
  customerPhone: "",
  onboardedAt: "",
  serviceStartDate: "",
  feeType: "one_time",
  homeAddressLine1: "",
  homeAddressLine2: "",
  homeCity: "",
  homeState: "",
  homePostalCode: "",
  homeCountry: "",
  preferredPaymentMethod: "",
  billingCadence: "",
  zelleSenderName: "",
  zelleSenderEmail: "",
  zelleSenderPhoneLast4: "",
  referralSource: "",
  billingNotes: "",
  criteriaSelections: [],
  customServices: [],
  invoiceSchedule: [],
};

const DEFAULT_PUBLIC_REFERRAL_FORM = {
  referrerCustomerCode: "",
  referrerEmail: "",
  referredFullName: "",
  referredEmail: "",
  referredPhone: "",
  relationshipLabel: "",
  notes: "",
};

const DEFAULT_PUBLIC_FEEDBACK_FORM = {
  customerCode: "",
  name: "",
  email: "",
  phone: "",
  category: "general",
  rating: "",
  message: "",
  attachments: [],
};

const LEGACY_CRITERION_CODE_BY_NAME = {
  authorship: "authorship",
  judging: "judging",
};

function splitCustomerName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function createOnboardingFormFromCustomer(customer) {
  const { firstName, lastName } = splitCustomerName(customer?.name);
  const primaryEmail = customer?.emails.find((email) => email.isPrimary)?.value ?? customer?.emails[0]?.value ?? "";
  const primaryPhone = customer?.phones.find((phone) => phone.isPrimary)?.value ?? customer?.phones[0]?.value ?? "";
  const zelleAlias = customer?.aliases.find((alias) => alias.relation === "zelle identity");

  return {
    ...DEFAULT_ONBOARDING_FORM,
    selectedCustomerId: customer?.id ?? "",
    firstName,
    lastName,
    customerEmail: primaryEmail,
    customerPhone: primaryPhone,
    onboardedAt: customer?.profile?.onboardedAt ?? "",
    serviceStartDate: customer?.profile?.serviceStartDate ?? customer?.activeContract?.serviceStartDate ?? "",
    preferredPaymentMethod: customer?.profile?.preferredPaymentMethod ?? DEFAULT_ONBOARDING_FORM.preferredPaymentMethod,
    feeType: customer?.profile?.feeType ?? DEFAULT_ONBOARDING_FORM.feeType,
    billingCadence: customer?.profile?.billingCadence ?? DEFAULT_ONBOARDING_FORM.billingCadence,
    zelleSenderName: zelleAlias?.name ?? "",
    zelleSenderEmail: zelleAlias?.email ?? "",
    zelleSenderPhoneLast4: zelleAlias?.phoneLast4 ?? "",
    referringCustomerId: customer?.profile?.referredByCustomerId ?? "",
    referralRelationship: customer?.profile?.referralRelationshipLabel ?? "",
    referralSource: customer?.profile?.referralSource ?? "",
    billingNotes: customer?.profile?.billingNotes ?? "",
    homeAddressLine1: customer?.profile?.homeAddressLine1 ?? "",
    homeAddressLine2: customer?.profile?.homeAddressLine2 ?? "",
    homeCity: customer?.profile?.homeCity ?? "",
    homeState: customer?.profile?.homeState ?? "",
    homePostalCode: customer?.profile?.homePostalCode ?? "",
    homeCountry: customer?.profile?.homeCountry ?? "",
  };
}

function buildServiceSelectionsFromParsedServices(services = []) {
  const criteriaSelections = [];
  const customServices = [];

  for (const service of services) {
    const definition = describeService(service.name ?? service.shortLabel ?? service.longLabel ?? service);
    if (definition.type === "criteria" && definition.code) {
      if (!criteriaSelections.some((selection) => selection.code === definition.code)) {
        criteriaSelections.push(createServiceSelectionEntry(definition.code));
      }
      continue;
    }

    customServices.push({
      ...createCustomServiceEntry(),
      name: definition.shortLabel,
    });
  }

  return {
    criteriaSelections,
    customServices,
  };
}

function getContractPrefillRank(contract) {
  return Number(contract?.prefillRank ?? contract?.parsed?.prefillRank ?? 0) || 0;
}

function selectPreferredContractUpload(contractUploads = [], { requireBilling = false, requireProfile = false } = {}) {
  return [...(Array.isArray(contractUploads) ? contractUploads : [])]
    .map((contract, index) => ({ contract, index }))
    .filter(({ contract }) => {
      if (requireBilling && !Boolean(contract?.prefillBilling ?? contract?.parsed?.prefillBilling)) {
        return false;
      }
      if (requireProfile && !Boolean(contract?.prefillProfile ?? contract?.parsed?.prefillProfile)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const rankDiff = getContractPrefillRank(right.contract) - getContractPrefillRank(left.contract);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return right.index - left.index;
    })[0]?.contract ?? null;
}

function getContractUsageLabel(contract) {
  const parsed = contract?.parsed ?? contract ?? {};
  if (parsed.prefillBilling) {
    return "Used for onboarding + billing";
  }
  if (parsed.prefillProfile) {
    return "Used for onboarding";
  }
  return "Supporting document only";
}

function buildInvoiceScheduleFromParsedContract(parsed = {}, fallbackServiceStartDate = "") {
  if (!parsed?.prefillBilling) {
    return [];
  }

  const fallbackDate =
    parsed.serviceStartDate ||
    parsed.contractDate ||
    fallbackServiceStartDate ||
    new Date().toISOString().slice(0, 10);
  const services = (parsed.services ?? []).map((service) => normalizeServiceLabel(service.name ?? service.shortLabel ?? service.longLabel ?? service));
  const primaryService = services[0] ?? "Authorship";
  const installments = Array.isArray(parsed.installments) ? parsed.installments : [];

  if (installments.length) {
    return installments.map((entry) =>
      createInvoiceScheduleEntry({
        label: entry.label ?? entry.milestone ?? "",
        serviceName: normalizeServiceLabel(entry.serviceName ?? entry.service ?? primaryService),
        milestone: entry.milestone ?? entry.label ?? "",
        amount: Number(entry.amount || 0),
        discountPct: Number(entry.discountPct || 0) || 0,
        dueDate: entry.dueDate || fallbackDate,
      }),
    );
  }

  if (Number(parsed.totalFee || 0) > 0) {
    return [
      createInvoiceScheduleEntry({
        label: parsed.feeType === "recurring" ? "Recurring charge" : "Contract fee",
        serviceName: primaryService,
        milestone: parsed.feeType === "recurring" ? "Recurring charge" : "Contract fee",
        amount: Number(parsed.totalFee || 0),
        dueDate: fallbackDate,
      }),
    ];
  }

  return [];
}

function buildOnboardingServiceEntries(form) {
  const criteriaEntries = form.criteriaSelections
    .map((selection) => {
      const option = EB1A_CRITERIA_OPTIONS.find((criterion) => criterion.code === selection.code);
      if (!option) {
        return null;
      }

      return {
        code: option.code,
        name: option.label,
        isCustom: false,
        enrolledAt: selection.enrolledAt,
      };
    })
    .filter(Boolean);

  const customEntries = form.customServices
    .map((service) => {
      const name = service.name.trim();
      if (!name) {
        return null;
      }

      return {
        code: "custom",
        name,
        isCustom: true,
        enrolledAt: service.enrolledAt,
      };
    })
    .filter(Boolean);

  return [...criteriaEntries, ...customEntries];
}

function findCriterionOptionByServiceName(serviceName) {
  const definition = describeService(serviceName);
  if (!definition?.code) {
    return null;
  }

  return EB1A_CRITERIA_OPTIONS.find((option) => option.code === definition.code) ?? null;
}

function createOnboardingPrefillFromInvoice(form) {
  const { firstName, lastName } = splitCustomerName(form.customerName);
  const criterion = findCriterionOptionByServiceName(form.service);
  const normalizedService = normalizeServiceLabel(form.service);

  return {
    ...DEFAULT_ONBOARDING_FORM,
    firstName,
    lastName,
    customerEmail: form.customerEmail,
    customerPhone: form.customerPhone,
    criteriaSelections: criterion ? [createServiceSelectionEntry(criterion.code)] : [],
    customServices:
      normalizedService && !criterion
        ? [{ ...createCustomServiceEntry(), name: normalizedService }]
        : [],
  };
}

function findExistingCriterionEnrollment(history, option) {
  return (
    history.find(
      (entry) =>
        entry.code === option.code ||
        entry.name === option.label ||
        LEGACY_CRITERION_CODE_BY_NAME[String(entry.name || "").trim().toLowerCase()] === option.code,
    ) ?? null
  );
}

function formatEnrollmentTimestamp(value) {
  if (!value) {
    return "Date not set";
  }

  return new Date(value).toLocaleString();
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "Use finance default" },
  { value: "zelle", label: "Zelle first" },
  { value: "card", label: "Card first" },
  { value: "both", label: "Both supported" },
];

const FEE_TYPE_OPTIONS = [
  { value: "one_time", label: "One-time fee" },
  { value: "recurring", label: "Recurring fee" },
];

const BILLING_CADENCE_OPTIONS = [
  { value: "", label: "Use finance default" },
  { value: "per_milestone", label: "Per milestone" },
  { value: "monthly", label: "Monthly cycle" },
  { value: "custom", label: "Custom cadence" },
];

function getBillingCadenceOptions(feeType) {
  if (feeType === "recurring") {
    return BILLING_CADENCE_OPTIONS.filter(
      (option) => option.value === "" || option.value === "monthly" || option.value === "custom",
    );
  }

  return BILLING_CADENCE_OPTIONS.filter(
    (option) => option.value === "" || option.value === "per_milestone" || option.value === "custom",
  );
}

const DASHBOARD_TRANSACTION_FILTERS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

const REFERRAL_RELATIONSHIP_OPTIONS = [
  { value: "", label: "Select relationship" },
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "colleague", label: "Colleague" },
  { value: "community", label: "Community" },
  { value: "former client", label: "Former client" },
  { value: "other", label: "Other" },
];

const FEEDBACK_CATEGORY_OPTIONS = [
  { value: "general", label: "General feedback" },
  { value: "billing", label: "Billing or invoice" },
  { value: "payment", label: "Payment or receipt" },
  { value: "portal", label: "Portal issue" },
  { value: "referral", label: "Referral program" },
  { value: "contract", label: "Contract upload" },
];

function createReferralProgramForm(config = {}) {
  return {
    enabled: config.enabled !== false,
    programName: config.programName ?? "Standard referral program",
    programDescription:
      config.programDescription ??
      "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
    bonusAmount: String(config.bonusAmount ?? 500),
    qualifyingPaidAmount: String(config.qualifyingPaidAmount ?? 3000),
    qualificationMonths: String(config.qualificationMonths ?? 6),
  };
}

function createGmailSyncForm(gmailStatus = {}) {
  const settings = gmailStatus.autoSync ?? gmailStatus.autoSyncSettings ?? {};
  return {
    enabled: settings.enabled !== false,
    intervalMinutes: String(settings.intervalMinutes ?? 5),
  };
}

function formatTransactionDate(value) {
  if (!value) {
    return "Not captured";
  }

  const parsed =
    value instanceof Date
      ? value
      : new Date(String(value).includes("T") ? String(value) : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function formatDateTimeValue(value) {
  if (!value) {
    return "Not captured";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${size} B`;
}

function formatExceptionResolutionAction(action) {
  const labels = {
    matched_customer: "Matched to customer",
    accept_full: "Accepted as full payment",
    apply_credit: "Marked for future credit",
    mark_duplicate: "Archived duplicate",
    accept_transaction: "Accepted transaction",
    reject_archive: "Rejected and archived",
    deleted_after_archive: "Deleted after archive",
  };

  return labels[action] ?? action?.replaceAll("_", " ") ?? "Resolved";
}

function createPreviewSnippet(value, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No email text was extracted.";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function formatCustomerReference(customer) {
  return customer?.customerCode ?? customer?.id ?? "Unassigned";
}

function formatPaymentSourceLabel(sourceProvider) {
  const route = MANUAL_PAYMENT_ROUTES.find((option) => option.value === sourceProvider);
  if (route) {
    return route.label;
  }

  if (sourceProvider === "gmail") {
    return "Gmail Zelle sync";
  }

  return sourceProvider ? sourceProvider.replaceAll("_", " ") : "Payment record";
}

function getPrimaryCustomerEmail(customer) {
  return customer?.emails?.find((email) => email.isPrimary)?.value ?? customer?.emails?.[0]?.value ?? "No email on file";
}

function getPrimaryCustomerPhone(customer) {
  return customer?.phones?.find((phone) => phone.isPrimary)?.value ?? customer?.phones?.[0]?.value ?? "No phone on file";
}

function summarizeCustomerServices(customer) {
  const services = customer?.services ?? [];
  const summary = summarizeServiceLabels(services, 4);
  if (!services.length) {
    return {
      primary: "No enrolled services yet",
      detail: "Add services during onboarding or later intake updates",
    };
  }

  return {
    primary: summary.visible.join(" · "),
    detail:
      summary.overflowCount
        ? `${services.length} enrolled services · +${summary.overflowCount} more`
        : `${services.length} enrolled service${services.length === 1 ? "" : "s"}`,
  };
}

function summarizeInvoiceReferences(customer) {
  const references = customer?.invoices ?? [];
  if (!references.length) {
    return {
      primary: "No invoice refs yet",
      detail: "Customer has not entered the invoice ledger",
    };
  }

  return {
    primary: references.slice(0, 2).join(" · "),
    detail:
      references.length <= 2
        ? `${references.length} invoice reference${references.length === 1 ? "" : "s"}`
        : `${references.length} invoice references total`,
  };
}

function formatCustomerAddress(customer) {
  const profile = customer?.profile ?? {};
  const parts = [
    profile.homeAddressLine1,
    profile.homeAddressLine2,
    [profile.homeCity, profile.homeState].filter(Boolean).join(", "),
    [profile.homePostalCode, profile.homeCountry].filter(Boolean).join(" "),
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  return parts.length ? parts.join("\n") : "No home address captured";
}

function buildCustomerLedgerStatus(customer, { dueInvoices = [], invoices = [], pendingPayments = [], exceptions = [] }) {
  const directException = exceptions.find((exception) => exception.customerId === customer.id);
  if (directException) {
    return {
      label:
        directException.kind === "duplicate"
          ? "Duplicate review"
          : directException.kind === "mismatch"
            ? "Mismatch"
            : "Needs review",
      tone: "danger",
      detail: directException.summary ?? "Customer has an open exception review",
    };
  }

  const ambiguousCandidate = exceptions.find((exception) =>
    exception.candidates?.some((candidate) => candidate.customerId === customer.id),
  );
  if (ambiguousCandidate) {
    return {
      label: "Possible match",
      tone: "warn",
      detail: ambiguousCandidate.summary ?? "Customer appears in an ambiguous payment review",
    };
  }

  const pendingPayment = pendingPayments.find((payment) => payment.customerId === customer.id);
  if (pendingPayment) {
    return {
      label: "Payment ready",
      tone: "success",
      detail: `${formatCurrency(pendingPayment.amountReceived || 0)} · ${
        pendingPayment.matchedInvoiceCode ?? "Ready to apply"
      }`,
    };
  }

  const overdueInvoice = invoices.find(
    (invoice) => invoice.customerId === customer.id && invoice.status === "overdue",
  );
  if (overdueInvoice) {
    return {
      label: "Overdue",
      tone: "danger",
      detail: `${overdueInvoice.invoiceCode} due ${formatShortDate(overdueInvoice.dueDate)}`,
    };
  }

  const sentInvoice = invoices.find((invoice) => invoice.customerId === customer.id && invoice.status === "sent");
  if (sentInvoice) {
    return {
      label: "Awaiting payment",
      tone: "ink",
      detail: `${sentInvoice.invoiceCode} due ${formatShortDate(sentInvoice.dueDate)}`,
    };
  }

  const draftInvoice =
    dueInvoices.find((invoice) => invoice.customerId === customer.id) ??
    invoices.find((invoice) => invoice.customerId === customer.id && invoice.status === "draft");
  if (draftInvoice) {
    return {
      label: "Draft queued",
      tone: "neutral",
      detail: `${draftInvoice.invoiceCode} ready to send`,
    };
  }

  if (customer.profile?.onboardingStatus === "needs_follow_up") {
    return {
      label: "Needs follow-up",
      tone: "warn",
      detail: "Profile is missing some onboarding detail",
    };
  }

  return {
    label: "Active",
    tone: "success",
    detail: `${formatFeeType(customer.profile?.feeType)} · ${formatPaymentMethod(customer.profile?.preferredPaymentMethod)} · ${formatBillingCadence(
      customer.profile?.billingCadence,
    )}`,
  };
}

function App() {
  const [route, setRoute] = useState(() => parsePortalRoute(window.location.pathname));
  const [state, setState] = useState(createInitialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState({ type: null, payload: null });
  const [invoiceForm, setInvoiceForm] = useState(DEFAULT_FORM);
  const [invoiceCustomerQuery, setInvoiceCustomerQuery] = useState("");
  const [manualPaymentForm, setManualPaymentForm] = useState(createDefaultManualPaymentForm);
  const [manualPaymentCustomerQuery, setManualPaymentCustomerQuery] = useState("");
  const [savingManualPayment, setSavingManualPayment] = useState(false);
  const [onboardingCustomerQuery, setOnboardingCustomerQuery] = useState("");
  const [onboardingForm, setOnboardingForm] = useState(DEFAULT_ONBOARDING_FORM);
  const [contractUploads, setContractUploads] = useState([]);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [savingReferralProgram, setSavingReferralProgram] = useState(false);
  const [applyingReferralRewardId, setApplyingReferralRewardId] = useState("");
  const [reviewingReferralSubmissionId, setReviewingReferralSubmissionId] = useState("");
  const [reviewingFeedbackId, setReviewingFeedbackId] = useState("");
  const [saveAlias, setSaveAlias] = useState(true);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [sendingReceiptId, setSendingReceiptId] = useState("");
  const [receivablesTab, setReceivablesTab] = useState("Overview");
  const [referralProgramForm, setReferralProgramForm] = useState(() =>
    createReferralProgramForm(createInitialState().admin?.referralProgram),
  );
  const [gmailSyncForm, setGmailSyncForm] = useState(() =>
    createGmailSyncForm(createInitialState().integrationStatus?.gmail),
  );
  const [savingGmailSyncSettings, setSavingGmailSyncSettings] = useState(false);
  const [auth, setAuth] = useState({
    checking: true,
    authenticated: false,
    username: "",
    usernameHint: DEFAULT_AUTH_FORM.username,
    usingDefaultCredentials: false,
    serverAvailable: true,
  });
  const [authForm, setAuthForm] = useState(DEFAULT_AUTH_FORM);
  const [authError, setAuthError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [publicReferralProgram, setPublicReferralProgram] = useState({
    enabled: true,
    programName: "Standard referral program",
    programDescription:
      "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
    bonusAmount: 500,
    qualifyingPaidAmount: 3000,
    qualificationMonths: 6,
  });
  const [publicReferralForm, setPublicReferralForm] = useState(DEFAULT_PUBLIC_REFERRAL_FORM);
  const [publicReferralLoading, setPublicReferralLoading] = useState(false);
  const [submittingPublicReferral, setSubmittingPublicReferral] = useState(false);
  const [publicReferralMessage, setPublicReferralMessage] = useState("");
  const [publicReferralError, setPublicReferralError] = useState("");
  const [publicFeedbackForm, setPublicFeedbackForm] = useState(DEFAULT_PUBLIC_FEEDBACK_FORM);
  const [submittingPublicFeedback, setSubmittingPublicFeedback] = useState(false);
  const [publicFeedbackMessage, setPublicFeedbackMessage] = useState("");
  const [publicFeedbackError, setPublicFeedbackError] = useState("");
  const [askSetuOpen, setAskSetuOpen] = useState(false);
  const [askSetuInput, setAskSetuInput] = useState("");
  const [askSetuMessages, setAskSetuMessages] = useState(() => [createAskSetuWelcomeMessage()]);

  const counts = {
    onboarded: state.customers.length,
    due: state.dueInvoices.length,
    confirm: state.pendingPayments.length,
    exceptions: state.exceptions.length,
  };
  const view = route.view;
  const isPortalHomeRoute = view === "portalHome";
  const isPublicReferralRoute = view === "publicReferral";
  const isPublicFeedbackRoute = view === "publicFeedback";
  const isPublicRoute = isPortalHomeRoute || isPublicReferralRoute || isPublicFeedbackRoute;
  const publicReferralGatewayCode =
    isPublicReferralRoute && route.referrerCode ? String(route.referrerCode).trim() : "";

  const searchResults = searchCustomers(state.customers, searchQuery);
  const needsAttention = buildAttentionItems(state.exceptions);
  const nextInvoicePreview = createInvoiceRefPreview(state.nextInvoiceSequence);
  const zellePreview = calculateZelleAmount(invoiceForm.amount, invoiceForm.discountPct);
  const selectedCustomer =
    state.customers.find((customer) => customer.id === invoiceForm.selectedCustomerId) ?? null;
  const invoiceCustomerResults = invoiceCustomerQuery.trim()
    ? searchCustomersByIdentity(state.customers, invoiceCustomerQuery)
    : [];
  const selectedManualPaymentCustomer =
    state.customers.find((customer) => customer.id === manualPaymentForm.selectedCustomerId) ?? null;
  const manualPaymentCustomerResults = manualPaymentCustomerQuery.trim()
    ? searchCustomersByIdentity(state.customers, manualPaymentCustomerQuery)
    : [];
  const serviceOptions = buildServiceOptions(selectedCustomer);
  const selectedOnboardingCustomer =
    state.customers.find((customer) => customer.id === onboardingForm.selectedCustomerId) ?? null;
  const selectedCustomer360 =
    route.view === "customer360"
      ? state.customers.find(
          (customer) =>
            customer.id === route.customerId || customer.customerCode === route.customerId,
        ) ?? null
      : null;
  const activeFinanceSection = getFinanceSection(view);
  const [shellTitle, shellSubtitle] = getFinanceShellCopy({
    view,
    customer: selectedCustomer360,
  });
  const onboardingCustomerResults = onboardingCustomerQuery.trim()
    ? searchCustomersByIdentity(state.customers, onboardingCustomerQuery)
    : [];
  const onboardingNeedsFollowUp = state.customers.filter(
    (customer) => customer.profile?.onboardingStatus === "needs_follow_up",
  ).length;
  const zelleReadyCount = state.customers.filter((customer) =>
    customer.aliases.some((alias) => alias.relation === "zelle identity"),
  ).length;
  const currentOnboardingHistory = selectedOnboardingCustomer?.serviceHistory ?? [];
  const referralProgram = state.admin?.referralProgram ?? {
    enabled: true,
    programName: "Standard referral program",
    programDescription:
      "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
    bonusAmount: 500,
    qualifyingPaidAmount: 3000,
    qualificationMonths: 6,
  };
  const referralInsights = buildReferralProgramInsights({
    referrals: state.admin?.referrals ?? [],
    rewards: state.admin?.rewards ?? [],
    invoices: state.invoices ?? [],
  });
  const referralTrend = buildReferralTrend(state.admin?.referrals ?? [], state.admin?.rewards ?? [], "month");
  const referralSubmissions = state.admin?.referralSubmissions ?? [];
  const feedbackSubmissions = state.admin?.feedbackSubmissions ?? [];
  const gmailSyncStatus = state.integrationStatus?.gmail ?? {};

  function navigateToRoute(nextRoute, { replace = false } = {}) {
    const targetPath = buildPortalPath(nextRoute);
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentPath !== targetPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", targetPath);
    }
    setRoute(nextRoute);
  }

  function navigateToView(nextView, { replace = false } = {}) {
    navigateToRoute(createPortalRoute(nextView), { replace });
  }

  function openCustomer360(customer) {
    const customerRouteKey = customer?.customerCode ?? customer?.id ?? "";
    if (!customerRouteKey) {
      return;
    }

    navigateToRoute(createPortalRoute("customer360", customerRouteKey));
  }

  function closeCustomer360() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    navigateToView("search", { replace: true });
  }

  useEffect(() => {
    document.title = getBrowserTitle(route, selectedCustomer360);
  }, [route.view, route.referrerCode, selectedCustomer360?.name]);

  useEffect(() => {
    setReferralProgramForm(createReferralProgramForm(state.admin?.referralProgram));
  }, [
    state.admin?.referralProgram?.enabled,
    state.admin?.referralProgram?.programName,
    state.admin?.referralProgram?.programDescription,
    state.admin?.referralProgram?.bonusAmount,
    state.admin?.referralProgram?.qualifyingPaidAmount,
    state.admin?.referralProgram?.qualificationMonths,
  ]);

  useEffect(() => {
    setGmailSyncForm(createGmailSyncForm(state.integrationStatus?.gmail));
  }, [
    state.integrationStatus?.gmail?.autoSync?.enabled,
    state.integrationStatus?.gmail?.autoSync?.intervalMinutes,
  ]);

  useEffect(() => {
    setSaveAlias(true);
  }, [modal.type, modal.payload?.id]);

  useEffect(() => {
    const canonicalRoute = parsePortalRoute(window.location.pathname);
    const canonicalPath = buildPortalPath(canonicalRoute);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({}, "", canonicalPath);
    }
    setRoute(canonicalRoute);

    function handlePopState() {
      setRoute(parsePortalRoute(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function resetPortalUi() {
    setRoute(createPortalRoute("dashboard"));
    setState(createInitialState());
    setSearchQuery("");
    setModal({ type: null, payload: null });
    setInvoiceForm({ ...DEFAULT_FORM });
    setInvoiceCustomerQuery("");
    setManualPaymentForm(createDefaultManualPaymentForm());
    setManualPaymentCustomerQuery("");
    setSavingManualPayment(false);
    setOnboardingCustomerQuery("");
    setOnboardingForm({ ...DEFAULT_ONBOARDING_FORM });
    setContractUploads([]);
    setUploadingContract(false);
    setSavingOnboarding(false);
    setSavingReferralProgram(false);
    setApplyingReferralRewardId("");
    setReviewingReferralSubmissionId("");
    setReviewingFeedbackId("");
    setSaveAlias(true);
    setSyncingInbox(false);
    setSendingReceiptId("");
    setAskSetuOpen(false);
    setAskSetuInput("");
    setAskSetuMessages([createAskSetuWelcomeMessage()]);
  }

  function applyAuthSnapshot(snapshot) {
    const usernameHint = snapshot?.auth?.usernameHint || DEFAULT_AUTH_FORM.username;

    setAuth({
      checking: false,
      authenticated: Boolean(snapshot?.authenticated),
      username: snapshot?.username ?? "",
      usernameHint,
      usingDefaultCredentials: Boolean(snapshot?.auth?.usingDefaultCredentials),
      serverAvailable: true,
    });

    return usernameHint;
  }

  function handleUnauthorized(error) {
    if (error?.status !== 401) {
      return false;
    }

    resetPortalUi();
    setAuth((current) => ({
      ...current,
      checking: false,
      authenticated: false,
      username: "",
    }));
    setAuthForm((current) => ({
      username: current.username || auth.usernameHint || DEFAULT_AUTH_FORM.username,
      password: "",
    }));
    setAuthError("Your session expired. Sign in again to reopen the portal.");
    pushToast("Session expired. Sign in again.");
    return true;
  }

  useEffect(() => {
    if (isPublicRoute) {
      setAuth((current) => ({
        ...current,
        checking: false,
      }));
      return;
    }

    let cancelled = false;

    async function hydratePortal() {
      try {
        const authSnapshot = await loadAuthStatus();
        if (!cancelled) {
          const usernameHint = applyAuthSnapshot(authSnapshot);
          setAuthForm({
            username: authSnapshot.username ?? usernameHint,
            password: "",
          });
          setAuthError("");
        }

        if (!authSnapshot.authenticated || cancelled) {
          return;
        }

        const data = await loadApiState();
        if (!cancelled) {
          setState(data.state);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (handleUnauthorized(error)) {
          return;
        }

        resetPortalUi();
        setAuth({
          checking: false,
          authenticated: false,
          username: "",
          usernameHint: DEFAULT_AUTH_FORM.username,
          usingDefaultCredentials: false,
          serverAvailable: false,
        });
        setAuthForm(DEFAULT_AUTH_FORM);
        setAuthError("The local portal server is unavailable. Restart `npm run dev` and try again.");
      }
    }

    hydratePortal();
    return () => {
      cancelled = true;
    };
  }, [isPublicRoute]);

  useEffect(() => {
    if (!isPublicReferralRoute) {
      return;
    }

    if (publicReferralGatewayCode) {
      setPublicReferralForm((current) =>
        current.referrerCustomerCode === publicReferralGatewayCode
          ? current
          : {
              ...current,
              referrerCustomerCode: publicReferralGatewayCode,
            },
      );
    }

    let cancelled = false;
    setPublicReferralLoading(true);
    setPublicReferralError("");

    async function hydratePublicReferralPage() {
      try {
        const data = await loadPublicReferralProgram();
        if (cancelled) {
          return;
        }

        setPublicReferralProgram(
          data.referralProgram ?? {
            enabled: true,
            programName: "Standard referral program",
            programDescription:
              "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
            bonusAmount: 500,
            qualifyingPaidAmount: 3000,
            qualificationMonths: 6,
          },
        );
      } catch (error) {
        if (!cancelled) {
          setPublicReferralError(error.message || "Could not load the referral form right now.");
        }
      } finally {
        if (!cancelled) {
          setPublicReferralLoading(false);
        }
      }
    }

    hydratePublicReferralPage();
    return () => {
      cancelled = true;
    };
  }, [isPublicReferralRoute, publicReferralGatewayCode]);

  function pushToast(message) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2600);
  }

  function openNewInvoice() {
    setInvoiceForm(DEFAULT_FORM);
    setInvoiceCustomerQuery("");
    setModal({ type: "new-invoice", payload: null });
  }

  function openOnboarding(prefill = null) {
    navigateToView("onboarding");
    setModal({ type: null, payload: null });
    setOnboardingCustomerQuery("");
    setOnboardingForm({
      ...DEFAULT_ONBOARDING_FORM,
      ...(prefill ?? {}),
    });
    setContractUploads([]);
  }

  function openSendPreview(invoiceId) {
    const invoice = state.dueInvoices.find((item) => item.id === invoiceId);
    if (!invoice) {
      return;
    }
    setModal({ type: "send-preview", payload: invoice });
  }

  function closeModal() {
    setModal({ type: null, payload: null });
  }

  async function signIn(event) {
    event.preventDefault();
    setLoggingIn(true);
    setAuthError("");

    try {
      const authSnapshot = await apiRequest("/api/auth/login", {
        method: "POST",
        body: {
          username: authForm.username.trim(),
          password: authForm.password,
        },
      });
      const data = await loadApiState();
      setState(data.state);
      applyAuthSnapshot(authSnapshot);
      setAuthForm((current) => ({
        username: authSnapshot.username ?? current.username.trim(),
        password: "",
      }));
      pushToast("Portal unlocked.");
    } catch (error) {
      if (error?.status === 401) {
        setAuthError(error.message);
      } else {
        setAuthError("Could not sign in. Check that the local backend is running.");
      }
    } finally {
      setLoggingIn(false);
    }
  }

  async function signOut() {
    try {
      const snapshot = await apiRequest("/api/auth/logout", {
        method: "POST",
      });
      const usernameHint = snapshot?.auth?.usernameHint || auth.usernameHint || DEFAULT_AUTH_FORM.username;
      resetPortalUi();
      setAuth({
        checking: false,
        authenticated: false,
        username: "",
        usernameHint,
        usingDefaultCredentials: Boolean(snapshot?.auth?.usingDefaultCredentials),
        serverAvailable: true,
      });
      setAuthForm({
        username: usernameHint,
        password: "",
      });
      setAuthError("");
      navigateToRoute(createPortalRoute("portalHome"), { replace: true });
      pushToast("Signed out.");
    } catch (error) {
      pushToast(error.message);
    }
  }

  async function sendInvoice(invoiceId) {
    try {
      const data = await apiRequest(`/api/invoices/${invoiceId}/send`, {
        method: "POST",
      });
      setState(data.state);
      closeModal();
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function sendAllInvoices() {
    if (!state.dueInvoices.length) {
      return;
    }

    try {
      const data = await apiRequest("/api/invoices/send-all", {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function confirmPayment(paymentId) {
    try {
      const data = await apiRequest(`/api/payments/${paymentId}/confirm`, {
        method: "POST",
      });
      setState(data.state);
      closeModal();
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function sendReceipt(paymentId) {
    setSendingReceiptId(paymentId);
    try {
      const data = await apiRequest(`/api/payments/${paymentId}/send-receipt`, {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSendingReceiptId("");
    }
  }

  async function recordManualPayment() {
    if (!manualPaymentForm.selectedCustomerId) {
      pushToast("Choose the customer before recording the payment.");
      return;
    }

    const amount = Number(manualPaymentForm.amountReceived);
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast("Enter a valid secured payment amount.");
      return;
    }

    setSavingManualPayment(true);
    try {
      const data = await apiRequest("/api/payments/manual", {
        method: "POST",
        body: {
          form: manualPaymentForm,
        },
      });
      setState(data.state);
      closeModal();
      setManualPaymentForm(createDefaultManualPaymentForm());
      setManualPaymentCustomerQuery("");
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSavingManualPayment(false);
    }
  }

  async function confirmAllPayments() {
    if (!state.pendingPayments.length) {
      return;
    }

    try {
      const data = await apiRequest("/api/payments/confirm-all", {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function resolveMismatch(exceptionId, actionType, toastLabel) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        body: { actionType },
      });
      setState(data.state);
      closeModal();
      pushToast(toastLabel || data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function acceptExceptionTransaction(exceptionId, candidate = null) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        body: {
          actionType: "accept_transaction",
          candidateCustomerId: candidate?.customerId ?? candidate?.id ?? null,
          saveAlias,
        },
      });
      setState(data.state);
      closeModal();
      pushToast(data.message || "Transaction approved and applied.");
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function rejectArchiveException(exceptionId) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        body: {
          actionType: "reject_archive",
        },
      });
      setState(data.state);
      closeModal();
      pushToast(data.message || "Exception rejected and archived.");
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function deleteArchivedException(exceptionId, form) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/delete-archived`, {
        method: "POST",
        body: form,
      });
      setState(data.state);
      closeModal();
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function resolveExceptionCustomer(exceptionId, candidate) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        body: {
          actionType: "matched_customer",
          candidateCustomerId: candidate.customerId ?? candidate.id,
          saveAlias,
        },
      });
      setState(data.state);
      closeModal();
      pushToast(
        saveAlias
          ? `${candidate.name} selected. Alias saved and transaction moved forward`
          : `${candidate.name} selected and transaction moved forward`,
      );
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function saveReferralProgram() {
    const programName = referralProgramForm.programName.trim();
    const programDescription = referralProgramForm.programDescription.trim();
    const bonusAmount = Number(referralProgramForm.bonusAmount);
    const qualifyingPaidAmount = Number(referralProgramForm.qualifyingPaidAmount);
    const qualificationMonths = Number(referralProgramForm.qualificationMonths);

    if (
      !programName ||
      !programDescription ||
      !Number.isFinite(bonusAmount) ||
      !Number.isFinite(qualifyingPaidAmount) ||
      !Number.isFinite(qualificationMonths)
    ) {
      pushToast("Enter a rule name, rule description, and valid referral values before saving.");
      return;
    }

    setSavingReferralProgram(true);
    try {
      const data = await apiRequest("/api/admin/referral-program", {
        method: "POST",
        body: {
          config: {
            enabled: referralProgramForm.enabled,
            programName,
            programDescription,
            bonusAmount,
            qualifyingPaidAmount,
            qualificationMonths,
          },
        },
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSavingReferralProgram(false);
    }
  }

  async function saveGmailSyncSettings() {
    const intervalMinutes = Number(gmailSyncForm.intervalMinutes);

    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
      pushToast("Enter a Gmail sync interval between 1 and 1,440 minutes.");
      return;
    }

    setSavingGmailSyncSettings(true);
    try {
      const data = await apiRequest("/api/admin/gmail-sync", {
        method: "POST",
        body: {
          config: {
            enabled: gmailSyncForm.enabled,
            intervalMinutes,
          },
        },
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSavingGmailSyncSettings(false);
    }
  }

  async function applyReferralReward(rewardId) {
    setApplyingReferralRewardId(rewardId);
    try {
      const data = await apiRequest(`/api/admin/referral-rewards/${rewardId}/apply`, {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setApplyingReferralRewardId("");
    }
  }

  async function convertReferralSubmission(submissionId) {
    setReviewingReferralSubmissionId(submissionId);
    try {
      const data = await apiRequest(`/api/admin/referral-submissions/${submissionId}/convert`, {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setReviewingReferralSubmissionId("");
    }
  }

  async function dismissReferralSubmissionEntry(submissionId) {
    setReviewingReferralSubmissionId(submissionId);
    try {
      const data = await apiRequest(`/api/admin/referral-submissions/${submissionId}/dismiss`, {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setReviewingReferralSubmissionId("");
    }
  }

  function updatePublicReferralForm(field, value) {
    setPublicReferralForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitPublicReferralForm(event) {
    event.preventDefault();
    setSubmittingPublicReferral(true);
    setPublicReferralError("");
    setPublicReferralMessage("");

    try {
      const data = await submitPublicReferral(publicReferralForm);
      setPublicReferralForm({
        ...DEFAULT_PUBLIC_REFERRAL_FORM,
        referrerCustomerCode: publicReferralGatewayCode,
      });
      setPublicReferralMessage(data.message);
    } catch (error) {
      setPublicReferralError(error.message || "Could not submit the referral right now.");
    } finally {
      setSubmittingPublicReferral(false);
    }
  }

  function updatePublicFeedbackForm(field, value) {
    setPublicFeedbackForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function attachPublicFeedbackFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (!files.length) {
      return;
    }

    setPublicFeedbackError("");

    try {
      const currentCount = publicFeedbackForm.attachments.length;
      if (currentCount + files.length > 3) {
        throw new Error("Attach up to 3 files.");
      }

      const attachments = [];
      for (const file of files) {
        if (file.size > 3 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than 3 MB.`);
        }

        attachments.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        });
      }

      setPublicFeedbackForm((current) => ({
        ...current,
        attachments: [...current.attachments, ...attachments],
      }));
    } catch (error) {
      setPublicFeedbackError(error.message || "Could not attach those files.");
    }
  }

  function removePublicFeedbackAttachment(attachmentId) {
    setPublicFeedbackForm((current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));
  }

  async function submitPublicFeedbackForm(event) {
    event.preventDefault();
    setSubmittingPublicFeedback(true);
    setPublicFeedbackError("");
    setPublicFeedbackMessage("");

    try {
      const data = await submitPublicFeedback(publicFeedbackForm);
      setPublicFeedbackForm(DEFAULT_PUBLIC_FEEDBACK_FORM);
      setPublicFeedbackMessage(data.message);
    } catch (error) {
      setPublicFeedbackError(error.message || "Could not submit feedback right now.");
    } finally {
      setSubmittingPublicFeedback(false);
    }
  }

  async function updateFeedbackStatus(feedbackId, actionType) {
    setReviewingFeedbackId(feedbackId);
    try {
      const data = await apiRequest(`/api/admin/feedback/${feedbackId}/${actionType}`, {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setReviewingFeedbackId("");
    }
  }

  function updateForm(field, value) {
    setInvoiceForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

function updateOnboardingForm(field, value) {
    setOnboardingForm((current) => {
      if (field === "feeType") {
        const nextFeeType = value || "one_time";
        let nextBillingCadence = current.billingCadence;
        if (nextFeeType === "recurring" && (!nextBillingCadence || nextBillingCadence === "per_milestone")) {
          nextBillingCadence = "monthly";
        }
        if (nextFeeType === "one_time" && nextBillingCadence === "monthly") {
          nextBillingCadence = "per_milestone";
        }

        return {
          ...current,
          feeType: nextFeeType,
          billingCadence: nextBillingCadence,
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  function updateInvoiceScheduleEntry(id, field, value) {
    setOnboardingForm((current) => ({
      ...current,
      invoiceSchedule: current.invoiceSchedule.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addInvoiceScheduleEntry() {
    setOnboardingForm((current) => {
      const currentCycle = current.invoiceSchedule.length + 1;
      const lastDueDate = current.invoiceSchedule.at(-1)?.dueDate || current.serviceStartDate;
      const nextDueDate =
        current.feeType === "recurring"
          ? current.invoiceSchedule.length
            ? shiftDateByCadence(lastDueDate || new Date().toISOString().slice(0, 10), current.billingCadence)
            : current.serviceStartDate || new Date().toISOString().slice(0, 10)
          : current.serviceStartDate || new Date().toISOString().slice(0, 10);

      return {
        ...current,
        invoiceSchedule: [
          ...current.invoiceSchedule,
          createInvoiceScheduleEntry({
            label: current.feeType === "recurring" ? `Cycle ${currentCycle}` : "",
            milestone: current.feeType === "recurring" ? `Cycle ${currentCycle}` : "",
            dueDate: nextDueDate,
            serviceName: buildOnboardingServiceEntries(current)[0]?.name ?? "Authorship",
          }),
        ],
      };
    });
  }

  function removeInvoiceScheduleEntry(id) {
    setOnboardingForm((current) => ({
      ...current,
      invoiceSchedule: current.invoiceSchedule.filter((entry) => entry.id !== id),
    }));
  }

  function applyContractPrefillsToForm(contractList) {
    const preferredProfileContract = selectPreferredContractUpload(contractList, { requireProfile: true });
    const preferredBillingContract = selectPreferredContractUpload(contractList, { requireBilling: true });
    const profileParsed = preferredProfileContract?.parsed ?? {};
    const billingParsed = preferredBillingContract?.parsed ?? {};
    const nextServices = buildServiceSelectionsFromParsedServices(profileParsed.services ?? []);
    const nextSchedule = buildInvoiceScheduleFromParsedContract(
      billingParsed,
      billingParsed.serviceStartDate || profileParsed.serviceStartDate,
    );
    const parsedName = splitCustomerName(profileParsed.clientName);

    setOnboardingForm((current) => ({
      ...current,
      firstName: parsedName.firstName || current.firstName,
      lastName: parsedName.lastName || current.lastName,
      customerEmail: profileParsed.customerEmail || current.customerEmail,
      customerPhone: profileParsed.customerPhone || current.customerPhone,
      serviceStartDate:
        billingParsed.serviceStartDate || profileParsed.serviceStartDate || current.serviceStartDate,
      feeType: billingParsed.feeType || current.feeType,
      billingCadence: billingParsed.billingCadence || current.billingCadence,
      criteriaSelections: nextServices.criteriaSelections.length
        ? nextServices.criteriaSelections
        : current.criteriaSelections,
      customServices: nextServices.customServices.length
        ? nextServices.customServices
        : current.customServices,
      invoiceSchedule: nextSchedule.length ? nextSchedule : current.invoiceSchedule,
    }));
  }

  async function uploadContracts(files) {
    const fileList = Array.from(files || []).filter(Boolean);
    if (!fileList.length) {
      return;
    }

    setUploadingContract(true);
    try {
      let nextUploads = [...contractUploads];
      for (const file of fileList) {
        const contentBase64 = await readFileAsDataUrl(file);
        const data = await apiRequest("/api/contracts/preview", {
          method: "POST",
          body: {
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            contentBase64,
          },
        });

        const uploadRecord = {
          id: crypto.randomUUID(),
          fileName: data.preview.fileName,
          mimeType: data.preview.mimeType,
          sizeBytes: data.preview.sizeBytes,
          extractedTextPreview: data.preview.extractedTextPreview,
          parsed: data.preview.parsed,
          contentBase64,
        };

        nextUploads = [...nextUploads, uploadRecord];
        setContractUploads(nextUploads);
        applyContractPrefillsToForm(nextUploads);
        pushToast(`${file.name} parsed and added to onboarding.`);
      }
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setUploadingContract(false);
    }
  }

  function removeContractUpload(uploadId) {
    const nextUploads = contractUploads.filter((contract) => contract.id !== uploadId);
    setContractUploads(nextUploads);
    applyContractPrefillsToForm(nextUploads);
  }

  function updateOnboardingCustomerQuery(value) {
    setOnboardingCustomerQuery(value);

    if (!selectedOnboardingCustomer) {
      return;
    }

    if (value !== selectedOnboardingCustomer.name) {
      setOnboardingForm((current) => ({
        ...DEFAULT_ONBOARDING_FORM,
        firstName: current.firstName,
        lastName: current.lastName,
        customerEmail: current.customerEmail,
        customerPhone: current.customerPhone,
        onboardedAt: current.onboardedAt,
        serviceStartDate: current.serviceStartDate,
        homeAddressLine1: current.homeAddressLine1,
        homeAddressLine2: current.homeAddressLine2,
        homeCity: current.homeCity,
        homeState: current.homeState,
        homePostalCode: current.homePostalCode,
        homeCountry: current.homeCountry,
        preferredPaymentMethod: current.preferredPaymentMethod,
        feeType: current.feeType,
        billingCadence: current.billingCadence,
        zelleSenderName: current.zelleSenderName,
        zelleSenderEmail: current.zelleSenderEmail,
        zelleSenderPhoneLast4: current.zelleSenderPhoneLast4,
        referringCustomerId: current.referringCustomerId,
        referralSource: current.referralSource,
        billingNotes: current.billingNotes,
        invoiceSchedule: current.invoiceSchedule,
      }));
    }
  }

  function selectOnboardingCustomer(customerId) {
    if (!customerId) {
      setOnboardingCustomerQuery("");
      setOnboardingForm(DEFAULT_ONBOARDING_FORM);
      setContractUploads([]);
      return;
    }

    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }

    setOnboardingCustomerQuery(customer.name);
    setOnboardingForm(createOnboardingFormFromCustomer(customer));
  }

  function toggleCriteriaSelection(code) {
    setOnboardingForm((current) => {
      const exists = current.criteriaSelections.some((selection) => selection.code === code);
      return {
        ...current,
        criteriaSelections: exists
          ? current.criteriaSelections.filter((selection) => selection.code !== code)
          : [...current.criteriaSelections, createServiceSelectionEntry(code)],
      };
    });
  }

  function updateCriteriaSelection(code, field, value) {
    setOnboardingForm((current) => ({
      ...current,
      criteriaSelections: current.criteriaSelections.map((selection) =>
        selection.code === code ? { ...selection, [field]: value } : selection,
      ),
    }));
  }

  function addCustomServiceEntry() {
    setOnboardingForm((current) => ({
      ...current,
      customServices: [...current.customServices, createCustomServiceEntry()],
    }));
  }

  function updateCustomServiceEntry(id, field, value) {
    setOnboardingForm((current) => ({
      ...current,
      customServices: current.customServices.map((service) =>
        service.id === id ? { ...service, [field]: value } : service,
      ),
    }));
  }

  function removeCustomServiceEntry(id) {
    setOnboardingForm((current) => ({
      ...current,
      customServices: current.customServices.filter((service) => service.id !== id),
    }));
  }

  function selectCustomer(customerId) {
    if (!customerId) {
      setInvoiceForm((current) => ({
        ...current,
        selectedCustomerId: "",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        selectedEmail: "",
        service: DEFAULT_FORM.service,
      }));
      setInvoiceCustomerQuery("");
      return;
    }

    if (customerId === "new") {
      setInvoiceForm((current) => ({
        ...current,
        selectedCustomerId: "new",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        selectedEmail: "",
        service: DEFAULT_FORM.service,
      }));
      setInvoiceCustomerQuery("");
      return;
    }

    const customer = state.customers.find((item) => item.id === customerId);
    if (!customer) {
      return;
    }

    const primaryEmail = customer.emails.find((email) => email.isPrimary) ?? customer.emails[0];

    setInvoiceForm((current) => ({
      ...current,
      selectedCustomerId: customer.id,
      customerName: customer.name,
      selectedEmail: primaryEmail?.value ?? "",
      service: customer.services?.[0] ?? current.service,
    }));
    setInvoiceCustomerQuery(customer.name);
  }

  function updateInvoiceCustomerQuery(value) {
    setInvoiceCustomerQuery(value);

    if (invoiceForm.selectedCustomerId === "new") {
      return;
    }

    if (!selectedCustomer) {
      return;
    }

    if (value !== selectedCustomer.name) {
      setInvoiceForm((current) => ({
        ...current,
        selectedCustomerId: "",
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        selectedEmail: "",
        service: DEFAULT_FORM.service,
      }));
    }
  }

  async function createInvoice({ sendNow }) {
    const isNewCustomer = invoiceForm.selectedCustomerId === "new";
    const targetName = isNewCustomer
      ? invoiceForm.customerName.trim()
      : selectedCustomer?.name ?? "";

    if (!targetName) {
      pushToast("Add a customer name before creating the invoice");
      return;
    }

    const primaryEmail = isNewCustomer
      ? invoiceForm.customerEmail.trim()
      : invoiceForm.selectedEmail ||
        selectedCustomer?.emails.find((email) => email.isPrimary)?.value ||
        selectedCustomer?.emails[0]?.value ||
        "";

    if (sendNow && !primaryEmail) {
      pushToast("Add an email before sending a new-customer invoice");
      return;
    }

    try {
      const data = await apiRequest("/api/invoices", {
        method: "POST",
        body: {
          form: invoiceForm,
          sendNow,
        },
      });
      setState(data.state);
      closeModal();
      setInvoiceForm(DEFAULT_FORM);
      setInvoiceCustomerQuery("");
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function submitOnboarding(event) {
    event.preventDefault();
    const serviceEntries = buildOnboardingServiceEntries(onboardingForm);
    const hasRequiredIdentity =
      onboardingForm.firstName.trim() &&
      onboardingForm.lastName.trim() &&
      onboardingForm.customerEmail.trim() &&
      onboardingForm.customerPhone.trim();

    if (!hasRequiredIdentity) {
      pushToast("First name, last name, email, and phone are required.");
      return;
    }

    if (!serviceEntries.length) {
      pushToast("Select at least one service enrollment.");
      return;
    }

    setSavingOnboarding(true);

    try {
      const data = await apiRequest("/api/customers", {
        method: "POST",
        body: {
          form: {
            ...onboardingForm,
            serviceEntries,
            contractUploads,
            invoiceSchedule: onboardingForm.invoiceSchedule,
          },
        },
      });
      setState(data.state);
      setOnboardingForm(DEFAULT_ONBOARDING_FORM);
      setOnboardingCustomerQuery("");
      setContractUploads([]);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSavingOnboarding(false);
    }
  }

  async function syncInbox() {
    setSyncingInbox(true);
    try {
      const data = await apiRequest("/api/gmail/sync", {
        method: "POST",
      });
      setState(data.state);
      pushToast(data.message);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    } finally {
      setSyncingInbox(false);
    }
  }

  function submitAskSetu(question) {
    const trimmed = String(question || "").trim();
    if (!trimmed) {
      return;
    }

    const answer = buildAskSetuAnswer(trimmed, state);
    setAskSetuMessages((current) => [
      ...current,
      createAskSetuMessage("user", trimmed),
      createAskSetuMessage("assistant", answer),
    ]);
    setAskSetuInput("");
    setAskSetuOpen(true);
  }

  if (isPortalHomeRoute) {
    return (
      <>
        <SetuPortalLandingView
          onOpenFinance={() => navigateToView("dashboard")}
          onOpenReferral={() => navigateToRoute(createPortalRoute("publicReferral"))}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  if (isPublicReferralRoute) {
    return (
      <>
        <PublicReferralView
          error={publicReferralError}
          form={publicReferralForm}
          gatewayCode={publicReferralGatewayCode}
          loading={publicReferralLoading}
          message={publicReferralMessage}
          program={publicReferralProgram}
          submitting={submittingPublicReferral}
          onFieldChange={updatePublicReferralForm}
          onOpenPortal={() => window.location.assign(buildPortalPath(createPortalRoute("dashboard")))}
          onSubmit={submitPublicReferralForm}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  if (isPublicFeedbackRoute) {
    return (
      <>
        <PublicFeedbackView
          error={publicFeedbackError}
          form={publicFeedbackForm}
          message={publicFeedbackMessage}
          submitting={submittingPublicFeedback}
          onAttachFiles={attachPublicFeedbackFiles}
          onFieldChange={updatePublicFeedbackForm}
          onOpenPortal={() => window.location.assign(buildPortalPath(createPortalRoute("dashboard")))}
          onRemoveAttachment={removePublicFeedbackAttachment}
          onSubmit={submitPublicFeedbackForm}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  if (auth.checking) {
    return <PortalLoadingView />;
  }

  if (!auth.authenticated) {
    return (
      <>
        <PortalLoginView
          authError={authError}
          authForm={authForm}
          loggingIn={loggingIn}
          onFieldChange={(field, value) => {
            setAuthForm((current) => ({
              ...current,
              [field]: value,
            }));
            if (authError) {
              setAuthError("");
            }
          }}
          onSubmit={signIn}
          serverAvailable={auth.serverAvailable}
          usingDefaultCredentials={auth.usingDefaultCredentials}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo-wrap">
          <SetuFinanceLogo
            home
            portalName={FINANCE_PORTAL.label}
            tagline={FINANCE_PORTAL.tagline}
            onClick={() => navigateToRoute(createPortalRoute("portalHome"))}
          />
        </div>
        <nav className="section-nav" aria-label="Finance console sections">
          {FINANCE_NAV_SECTIONS.map((item) => {
            const Icon = item.icon;
            const isActive = activeFinanceSection === item.section;
            const badgeValue =
              item.section === "receivables"
                ? counts.due + counts.confirm + counts.exceptions
                : item.section === "referrals"
                  ? (state.admin?.referralSubmissions ?? []).filter((submission) => submission.status === "submitted").length
                  : null;
            return (
              <button
                className={`nav-item ${isActive ? "active" : ""}`}
                key={item.section}
                onClick={() => navigateToView(item.view)}
                type="button"
              >
                <Icon size={17} />
                <span className="nav-item-copy">
                  <span>{item.label}</span>
                  <small>{item.helper}</small>
                </span>
                {badgeValue ? <span className="badge">{badgeValue}</span> : <span className={`nav-marker ${item.marker}`} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <IconCircleCheckFilled size={13} />
            Signed in as {auth.username}
          </div>
          <div className="sidebar-foot-note">
            Gmail credentials preserved · auto-sync {gmailSyncStatus?.autoSync?.active ? "on" : "configurable"}
          </div>
          <div className="sidebar-actions">
            <button className="btn btn-sm sidebar-profile-action" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="shell-topbar">
          <div>
            <h1>{shellTitle}</h1>
            <div className="sub">{shellSubtitle}</div>
          </div>
          <div className="topbar-right">
            <span className={`chip ${state.integrationStatus?.email?.configured ? "chip-ok" : "chip-warn"}`}>
              <IconMail size={14} />
              {state.integrationStatus?.email?.configured ? "Email ready" : "Email setup needed"}
            </span>
            <span
              className={`chip ${
                state.integrationStatus?.gmail?.authorized ? "chip-ok" : "chip-warn"
              }`}
            >
              <IconRefresh size={14} />
              {state.integrationStatus?.gmail?.authorized ? "Gmail authorized" : "Gmail needs auth"}
            </span>
            <span className="chip chip-scope">All regions</span>
          </div>
        </header>
        {view === "clients" && (
          <ClientsHubView
            counts={counts}
            customers={state.customers}
            dueInvoices={state.dueInvoices}
            pendingPayments={state.pendingPayments}
            exceptions={state.exceptions}
            onOpenOnboarding={() => navigateToView("onboarding")}
            onOpenRegister={() => navigateToView("search")}
            onOpenCustomer={openCustomer360}
          />
        )}
        {view === "onboarding" && (
          <OnboardingView
            contractUploads={contractUploads}
            currentHistory={currentOnboardingHistory}
            counts={counts}
            customers={state.customers}
            customerQuery={onboardingCustomerQuery}
            customerResults={onboardingCustomerResults}
            currentCustomer={selectedOnboardingCustomer}
            needsFollowUp={onboardingNeedsFollowUp}
            onAddCustomService={addCustomServiceEntry}
            onAddInvoiceScheduleEntry={addInvoiceScheduleEntry}
            onCriteriaChange={updateCriteriaSelection}
            onCustomerQueryChange={updateOnboardingCustomerQuery}
            onContractUpload={uploadContracts}
            onInvoiceScheduleChange={updateInvoiceScheduleEntry}
            onRemoveContract={removeContractUpload}
            onRemoveInvoiceScheduleEntry={removeInvoiceScheduleEntry}
            saving={savingOnboarding}
            onCustomServiceChange={updateCustomServiceEntry}
            onRemoveCustomService={removeCustomServiceEntry}
            referralProgram={referralProgram}
            form={onboardingForm}
            onSelectCustomer={selectOnboardingCustomer}
            zelleReadyCount={zelleReadyCount}
            onFormChange={updateOnboardingForm}
            onOpenConsole={() => navigateToView("console")}
            onSubmit={submitOnboarding}
            onToggleCriteria={toggleCriteriaSelection}
            uploadingContract={uploadingContract}
          />
        )}
        {view === "dashboard" && (
          <DashboardView
            dashboard={state.dashboard}
            payments={state.payments}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            referralTrend={referralTrend}
            needsAttention={needsAttention}
            onOpenOnboarding={() => navigateToView("onboarding")}
            onOpenConsole={() => navigateToView("console")}
          />
        )}
        {view === "console" && (
          <ConsoleView
            activeTab={receivablesTab}
            onTabChange={setReceivablesTab}
            counts={counts}
            dueInvoices={state.dueInvoices}
            integrationStatus={state.integrationStatus}
            pendingPayments={state.pendingPayments}
            payments={state.payments}
            exceptions={state.exceptions}
            archivedExceptions={state.archivedExceptions ?? []}
            exceptionHistory={state.exceptionHistory ?? []}
            onOpenNewInvoice={openNewInvoice}
            onOpenManualPayment={() => {
              setManualPaymentForm(createDefaultManualPaymentForm());
              setManualPaymentCustomerQuery("");
              setModal({ type: "manual-payment", payload: null });
            }}
            onSendAll={sendAllInvoices}
            onPreviewInvoice={openSendPreview}
            onConfirmPayment={confirmPayment}
            onConfirmAll={confirmAllPayments}
            onSendReceipt={sendReceipt}
            onSyncInbox={syncInbox}
            onOpenPayment={(payment) => setModal({ type: "payment-review", payload: payment })}
            onOpenMismatch={(exception) => setModal({ type: "mismatch", payload: exception })}
            onOpenExceptionReview={(exception) => setModal({ type: "exception-review", payload: exception })}
            onOpenArchivedDelete={(exception) => setModal({ type: "delete-archived-exception", payload: exception })}
            sendingReceiptId={sendingReceiptId}
            syncingInbox={syncingInbox}
          />
        )}
        {view === "receivables" && (
          <ConsoleView
            activeTab={receivablesTab}
            onTabChange={setReceivablesTab}
            counts={counts}
            dueInvoices={state.dueInvoices}
            integrationStatus={state.integrationStatus}
            pendingPayments={state.pendingPayments}
            payments={state.payments}
            exceptions={state.exceptions}
            archivedExceptions={state.archivedExceptions ?? []}
            exceptionHistory={state.exceptionHistory ?? []}
            onOpenNewInvoice={openNewInvoice}
            onOpenManualPayment={() => {
              setManualPaymentForm(createDefaultManualPaymentForm());
              setManualPaymentCustomerQuery("");
              setModal({ type: "manual-payment", payload: null });
            }}
            onSendAll={sendAllInvoices}
            onPreviewInvoice={openSendPreview}
            onConfirmPayment={confirmPayment}
            onConfirmAll={confirmAllPayments}
            onSendReceipt={sendReceipt}
            onSyncInbox={syncInbox}
            onOpenPayment={(payment) => setModal({ type: "payment-review", payload: payment })}
            onOpenMismatch={(exception) => setModal({ type: "mismatch", payload: exception })}
            onOpenExceptionReview={(exception) => setModal({ type: "exception-review", payload: exception })}
            onOpenArchivedDelete={(exception) => setModal({ type: "delete-archived-exception", payload: exception })}
            sendingReceiptId={sendingReceiptId}
            syncingInbox={syncingInbox}
          />
        )}
        {view === "payables" && (
          <PayablesHubView
            invoices={state.invoices}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            onOpenReferrals={() => navigateToView("referrals")}
            onOpenReceivables={() => navigateToView("receivables")}
          />
        )}
        {view === "search" && (
          <SearchView
            customers={state.customers}
            dueInvoices={state.dueInvoices}
            invoices={state.invoices}
            pendingPayments={state.pendingPayments}
            exceptions={state.exceptions}
            query={searchQuery}
            results={searchResults}
            onQueryChange={setSearchQuery}
            onOpenCustomer={(customer) => openCustomer360(customer)}
          />
        )}
        {view === "customer360" && (
          <Customer360Page
            customer={selectedCustomer360}
            customers={state.customers}
            invoices={state.invoices}
            payments={state.payments}
            pendingPayments={state.pendingPayments}
            exceptions={state.exceptions}
            exceptionHistory={state.exceptionHistory ?? []}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            onBack={closeCustomer360}
          />
        )}
        {(view === "admin" || view === "referrals") && (
          <AdminView
            referralProgram={referralProgram}
            feedbackSubmissions={feedbackSubmissions}
            invoices={state.invoices}
            referralSubmissions={referralSubmissions}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            insights={referralInsights}
            applyingRewardId={applyingReferralRewardId}
            reviewingFeedbackId={reviewingFeedbackId}
            reviewingSubmissionId={reviewingReferralSubmissionId}
            onApplyReward={applyReferralReward}
            onConvertSubmission={convertReferralSubmission}
            onDismissSubmission={dismissReferralSubmissionEntry}
            onUpdateFeedbackStatus={updateFeedbackStatus}
          />
        )}
        {view === "people" && (
          <PeopleHubView
            customers={state.customers}
            referralParties={state.admin?.referralParties ?? []}
            referrals={state.admin?.referrals ?? []}
            onOpenClients={() => navigateToView("clients")}
            onOpenReferrals={() => navigateToView("referrals")}
          />
        )}
        {view === "settings" && (
          <SettingsView
            username={auth.username}
            referralProgramForm={referralProgramForm}
            gmailSyncStatus={gmailSyncStatus}
            gmailSyncForm={gmailSyncForm}
            savingReferralProgram={savingReferralProgram}
            savingGmailSync={savingGmailSyncSettings}
            onReferralFormChange={(field, value) =>
              setReferralProgramForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onGmailSyncFormChange={(field, value) =>
              setGmailSyncForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSaveReferralProgram={saveReferralProgram}
            onSaveGmailSync={saveGmailSyncSettings}
          />
        )}
        {view === "audit" && (
          <AuditHubView
            activity={state.activity ?? []}
            authAuditEvents={state.admin?.authAuditEvents ?? []}
            exceptionHistory={state.exceptionHistory ?? []}
            referralEvents={state.admin?.referralEvents ?? []}
            onOpenReceivables={() => navigateToView("receivables")}
            onOpenReferrals={() => navigateToView("referrals")}
          />
        )}
      </main>

      <ModalShell show={modal.type === "new-invoice"} onClose={closeModal}>
        <NewInvoiceModal
          customers={state.customers}
          customerQuery={invoiceCustomerQuery}
          customerResults={invoiceCustomerResults}
          form={invoiceForm}
          onClose={closeModal}
          onCreateInvoice={createInvoice}
          onCustomerQueryChange={updateInvoiceCustomerQuery}
          onFormChange={updateForm}
          onSelectCustomer={selectCustomer}
          selectedCustomer={selectedCustomer}
          invoiceCode={nextInvoicePreview}
          onOpenOnboarding={() => openOnboarding(createOnboardingPrefillFromInvoice(invoiceForm))}
          serviceOptions={serviceOptions}
          zelleAmount={zellePreview}
        />
      </ModalShell>

      <ModalShell show={modal.type === "send-preview"} onClose={closeModal}>
        <SendPreviewModal invoice={modal.payload} onClose={closeModal} onSend={sendInvoice} />
      </ModalShell>

      <ModalShell show={modal.type === "payment-review"} onClose={closeModal} size="wide">
        <PaymentReviewModal payment={modal.payload} onApply={confirmPayment} onClose={closeModal} />
      </ModalShell>

      <ModalShell show={modal.type === "manual-payment"} onClose={closeModal} size="wide">
        <ManualPaymentModal
          customers={state.customers}
          customerQuery={manualPaymentCustomerQuery}
          customerResults={manualPaymentCustomerResults}
          form={manualPaymentForm}
          invoices={state.invoices}
          onChange={(patch) => setManualPaymentForm((current) => ({ ...current, ...patch }))}
          onClose={closeModal}
          onCustomerQueryChange={setManualPaymentCustomerQuery}
          onSubmit={recordManualPayment}
          saving={savingManualPayment}
          selectedCustomer={selectedManualPaymentCustomer}
        />
      </ModalShell>

      <ModalShell show={modal.type === "mismatch"} onClose={closeModal} size="wide">
        <MismatchModal
          exception={modal.payload}
          onAccept={() =>
            resolveMismatch(
              modal.payload?.id,
              "accept_full",
              "Transaction moved into the apply queue as a full-payment override.",
            )
          }
          onCredit={() =>
            resolveMismatch(
              modal.payload?.id,
              "apply_credit",
              "Overpayment marked for future credit review.",
            )
          }
          onReject={() => rejectArchiveException(modal.payload?.id)}
          onClose={closeModal}
        />
      </ModalShell>

      <ModalShell show={modal.type === "exception-review"} onClose={closeModal} size="wide">
        <ExceptionReviewModal
          customers={state.customers}
          exception={modal.payload}
          saveAlias={saveAlias}
          onChangeSaveAlias={setSaveAlias}
          onClose={closeModal}
          onAcceptCandidate={(candidate) => acceptExceptionTransaction(modal.payload?.id, candidate)}
          onResolveCustomer={(candidate) => resolveExceptionCustomer(modal.payload?.id, candidate)}
          onRejectArchive={() => rejectArchiveException(modal.payload?.id)}
          onAcceptTransaction={() => acceptExceptionTransaction(modal.payload?.id)}
        />
      </ModalShell>

      <ModalShell show={modal.type === "delete-archived-exception"} onClose={closeModal}>
        <DeleteArchivedExceptionModal
          exception={modal.payload}
          onClose={closeModal}
          onDelete={(form) => deleteArchivedException(modal.payload?.id, form)}
        />
      </ModalShell>

      <AskSetuWidget
        exceptionCount={state.exceptions.length}
        inputValue={askSetuInput}
        messages={askSetuMessages}
        onInputChange={setAskSetuInput}
        onOpenChange={setAskSetuOpen}
        onSubmit={submitAskSetu}
        open={askSetuOpen}
        pendingCount={state.pendingPayments.length}
        suggestions={ASK_SETU_SUGGESTIONS}
      />

      <ToastStack toasts={toasts} />
    </div>
  );
}

function PortalLoadingView() {
  return (
    <div className="auth-shell auth-shell-loading">
      <div className="auth-loading-card">
        <SetuFinanceLogo className="auth-wordmark" portalName={FINANCE_PORTAL.label} tagline={FINANCE_PORTAL.tagline} />
        <div className="auth-loading-copy">Checking your local portal session…</div>
      </div>
    </div>
  );
}

function PortalLoginView({
  authError,
  authForm,
  loggingIn,
  onFieldChange,
  onSubmit,
  serverAvailable,
  usingDefaultCredentials,
}) {
  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <section className="auth-hero">
          <SetuFinanceLogo className="auth-wordmark" portalName={FINANCE_PORTAL.label} tagline={FINANCE_PORTAL.tagline} />
          <div className="auth-kicker">Finance portal</div>
          <h1>Local access is now protected.</h1>
          <p className="auth-copy">
            Sign in before invoices, customer records, and Zelle inbox matches load in the browser.
          </p>
          <div className="auth-points">
            <div className="auth-point">
              <IconFileInvoice size={15} />
              Invoice sending and receipt emails
            </div>
            <div className="auth-point">
              <IconSearch size={15} />
              Customer search and exception review
            </div>
            <div className="auth-point">
              <IconMail size={15} />
              Gmail sync for Zelle confirmations
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-card-head">
            <div className="auth-card-label">Portal sign-in</div>
            <h2>Username and password</h2>
            <p className="auth-card-copy">
              Use your local credentials to unlock the billing console.
            </p>
          </div>

          {!serverAvailable && (
            <div className="note warn auth-note">
              The local backend is not responding right now. Restart `npm run dev`, then sign in again.
            </div>
          )}

          {usingDefaultCredentials && (
            <div className="note info auth-note">
              Demo credentials are active. Change `PORTAL_USERNAME` and `PORTAL_PASSWORD` in `.env`
              after your first sign-in.
            </div>
          )}

          {authError && <div className="note warn auth-note">{authError}</div>}

          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="portal-username">Username</label>
              <input
                id="portal-username"
                autoComplete="username"
                value={authForm.username}
                onChange={(event) => onFieldChange("username", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="portal-password">Password</label>
              <input
                id="portal-password"
                type="password"
                autoComplete="current-password"
                value={authForm.password}
                onChange={(event) => onFieldChange("password", event.target.value)}
              />
            </div>
            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={!authForm.username.trim() || !authForm.password || loggingIn}
            >
              {loggingIn ? "Unlocking…" : "Unlock portal"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function SetuPortalLandingView({ onOpenFinance, onOpenReferral }) {
  function handlePortalAction(portal) {
    if (portal.id === "finance") {
      onOpenFinance();
      return;
    }
    if (portal.id === "referral") {
      onOpenReferral();
    }
  }

  return (
    <main className="portal-landing">
      <section className="portal-hero">
        <div className="portal-hero-copy">
          <SetuFinanceLogo className="portal-hero-logo" />
          <div className="portal-kicker">One family · five portals</div>
          <h1>One Setu identity, purpose-built portals.</h1>
          <p>
            Shared wordmark, shared geometry, differentiated by icon and accent. Finance is live
            today; Referral has its own public gateway; the remaining portals are staged for the
            product suite.
          </p>
        </div>
        <div className="portal-hero-card">
          <div className="portal-hero-card-label">Live now</div>
          <div className="portal-hero-card-title">Finance + Referral</div>
          <div className="portal-hero-card-copy">
            Jump into the contract-to-cash workspace or share the referral intake link without
            asking users to log into finance.
          </div>
          <div className="portal-hero-actions">
            <button className="btn" type="button" onClick={onOpenFinance}>
              Open Finance <IconArrowRight size={15} />
            </button>
            <button className="btn btn-ghost" type="button" onClick={onOpenReferral}>
              Referral gateway
            </button>
          </div>
        </div>
      </section>

      <section className="portal-switch-section">
        <div className="portal-section-heading">
          <div>
            <div className="portal-section-number">05</div>
            <h2>One bar, all portals</h2>
          </div>
          <p>
            The Setu mark never changes. Each portal swaps only its accent and icon so five tools
            still feel like one product.
          </p>
        </div>
        <div className="portal-switchbar">
          <SetuFinanceLogo className="portal-switch-logo" />
          <div className="portal-switch-pills">
            {SETU_PORTALS.map((portal) => (
              <button
                className={`portal-switch-pill ${portal.status === "Live" ? "is-live" : ""}`}
                disabled={portal.status !== "Live"}
                key={portal.id}
                onClick={() => handlePortalAction(portal)}
                style={{ "--portal-accent": portal.accent }}
                type="button"
              >
                <span className="portal-pill-dot" />
                {portal.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="portal-family-section">
        <div className="portal-section-heading">
          <div>
            <div className="portal-section-number">04</div>
            <h2>The five portals</h2>
          </div>
          <p>
            Each card keeps the same structure: setu family name, portal name, exact tagline, and
            accent color.
          </p>
        </div>
        <div className="portal-card-grid">
          {SETU_PORTALS.map((portal) => {
            const Icon = portal.icon;
            const isLive = portal.status === "Live";
            return (
              <article
                className={`portal-card ${isLive ? "is-live" : "is-soon"}`}
                key={portal.id}
                style={{ "--portal-accent": portal.accent, "--portal-tint": portal.tint }}
              >
                <div className="portal-card-icon">
                  <Icon size={24} />
                </div>
                <div className="portal-card-setu">{portal.setuLabel}</div>
                <h3>{portal.label}</h3>
                <p>{portal.tagline}</p>
                <div className="portal-card-footer">
                  <span>{portal.accent}</span>
                  <button
                    className="btn btn-sm"
                    disabled={!isLive}
                    onClick={() => handlePortalAction(portal)}
                    type="button"
                  >
                    {isLive ? "Open" : "Coming soon"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function PublicReferralView({
  error,
  form,
  gatewayCode = "",
  loading,
  message,
  program,
  submitting,
  onFieldChange,
  onOpenPortal,
  onSubmit,
}) {
  const rulesSummary = program.enabled
    ? `${formatCurrency(program.bonusAmount)} bonus after ${formatCurrency(
        program.qualifyingPaidAmount,
      )} paid or ${program.qualificationMonths} months, whichever comes first.`
    : "Referral intake is currently paused for new submissions.";
  const hasGatewayCode = Boolean(gatewayCode);

  return (
    <div className="auth-shell public-referral-shell">
      <div className="auth-grid public-referral-grid">
        <section className="auth-hero public-referral-hero">
          <SetuFinanceLogo
            className="auth-wordmark"
            portalName={REFERRAL_PORTAL?.label}
            tagline={REFERRAL_PORTAL?.tagline}
          />
          <div className="auth-kicker">{hasGatewayCode ? "Referral gateway" : "Referral intake"}</div>
          <h1>{hasGatewayCode ? "Share referrals from your gateway." : "Share a friend or family referral."}</h1>
          <p className="auth-copy">
            {hasGatewayCode
              ? "This personal referral link pre-fills your customer ID. Finance still verifies your email before converting an entry into the referral program."
              : "This public form does not require a login. Finance will review each entry before it becomes a tracked referral relationship in Setu Finance."}
          </p>
          <div className="auth-points">
            <div className="auth-point">
              <IconCheck size={15} />
              One active entry per referred email or phone
            </div>
            <div className="auth-point">
              <IconUsers size={15} />
              Your customer ID and email verify the referrer
            </div>
            <div className="auth-point">
              <IconTable size={15} />
              Finance converts qualified entries into the referral dashboard
            </div>
          </div>
          <div className="chart-card public-referral-summary">
            <div className="detail-label">{program.programName || "Referral program"}</div>
            <div className="cust">{rulesSummary}</div>
            <div className="sub">
              {program.programDescription}
              {hasGatewayCode ? ` Gateway customer ID: ${gatewayCode}.` : ""}
            </div>
          </div>
          <button className="btn btn-sm public-referral-portal-link" type="button" onClick={onOpenPortal}>
            Open finance portal
          </button>
        </section>

        <section className="auth-card public-referral-card">
          <div className="auth-card-head">
            <div className="auth-card-label">{hasGatewayCode ? "Personalized gateway" : "No login required"}</div>
            <h2>Submit a referral</h2>
            <p className="auth-card-copy">
              {hasGatewayCode
                ? "Your customer ID is locked from this link. Use the same email Setu already has on file for you."
                : "Use the same customer ID and email that Setu already has on file for you."}
            </p>
          </div>

          {loading && <div className="note info auth-note">Loading referral rules…</div>}
          {!program.enabled && <div className="note warn auth-note">Referral intake is currently disabled.</div>}
          {message && <div className="note info auth-note">{message}</div>}
          {error && <div className="note warn auth-note">{error}</div>}

          <form onSubmit={onSubmit}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="refer-referrer-code">
                  {hasGatewayCode ? "Gateway customer ID" : "Your customer ID"}
                </label>
                <input
                  id="refer-referrer-code"
                  value={form.referrerCustomerCode}
                  onChange={(event) => onFieldChange("referrerCustomerCode", event.target.value)}
                  readOnly={hasGatewayCode}
                  placeholder="100001"
                />
                {hasGatewayCode && <div className="field-help">Loaded from this user's referral gateway link.</div>}
              </div>
              <div className="field">
                <label htmlFor="refer-referrer-email">Your email</label>
                <input
                  id="refer-referrer-email"
                  type="email"
                  autoComplete="email"
                  value={form.referrerEmail}
                  onChange={(event) => onFieldChange("referrerEmail", event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="refer-name">Friend or family member name</label>
              <input
                id="refer-name"
                value={form.referredFullName}
                onChange={(event) => onFieldChange("referredFullName", event.target.value)}
                placeholder="Full name"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="refer-email">Their email</label>
                <input
                  id="refer-email"
                  type="email"
                  autoComplete="off"
                  value={form.referredEmail}
                  onChange={(event) => onFieldChange("referredEmail", event.target.value)}
                  placeholder="friend@example.com"
                />
              </div>
              <div className="field">
                <label htmlFor="refer-phone">Their phone (optional)</label>
                <input
                  id="refer-phone"
                  autoComplete="tel"
                  value={form.referredPhone}
                  onChange={(event) => onFieldChange("referredPhone", event.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="refer-relationship">Relationship</label>
              <input
                id="refer-relationship"
                value={form.relationshipLabel}
                onChange={(event) => onFieldChange("relationshipLabel", event.target.value)}
                placeholder="Family, friend, colleague…"
              />
            </div>

            <div className="field">
              <label htmlFor="refer-notes">Notes (optional)</label>
              <textarea
                id="refer-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => onFieldChange("notes", event.target.value)}
                placeholder="Anything finance should know before they onboard this person."
              />
            </div>

            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={
                !program.enabled ||
                submitting ||
                !form.referrerCustomerCode.trim() ||
                !form.referrerEmail.trim() ||
                !form.referredFullName.trim() ||
                !form.referredEmail.trim()
              }
            >
              {submitting ? "Submitting…" : "Submit referral"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function PublicFeedbackView({
  error,
  form,
  message,
  submitting,
  onAttachFiles,
  onFieldChange,
  onOpenPortal,
  onRemoveAttachment,
  onSubmit,
}) {
  const hasRequiredFields = form.name.trim() && form.email.trim() && form.message.trim();

  return (
    <div className="auth-shell public-referral-shell">
      <div className="auth-grid public-referral-grid">
        <section className="auth-hero public-referral-hero">
          <SetuFinanceLogo className="auth-wordmark" portalName="Feedback" tagline="User feedback · issues & ideas" />
          <div className="auth-kicker">Feedback</div>
          <h1>Share what should work better.</h1>
          <p className="auth-copy">
            Use this simple no-login form for portal feedback, billing questions, payment receipt
            issues, referral feedback, or anything that helps Setu improve.
          </p>
          <div className="auth-points">
            <div className="auth-point">
              <IconCheck size={15} />
              No portal login required
            </div>
            <div className="auth-point">
              <IconMail size={15} />
              Admins review every submission inside Setu
            </div>
            <div className="auth-point">
              <IconTable size={15} />
              Attach screenshots or documents when helpful
            </div>
          </div>
          <div className="chart-card public-referral-summary">
            <div className="detail-label">Internal triage</div>
            <div className="cust">Feedback stays in Setu first.</div>
            <div className="sub">
              Admins can decide later whether an item should become a GitHub issue for engineering.
            </div>
          </div>
          <button className="btn btn-sm public-referral-portal-link" type="button" onClick={onOpenPortal}>
            Open finance portal
          </button>
        </section>

        <section className="auth-card public-referral-card">
          <div className="auth-card-head">
            <div className="auth-card-label">No login required</div>
            <h2>Submit feedback</h2>
            <p className="auth-card-copy">
              Add your customer ID if you know it. Attachments are optional and limited to 3 MB each.
            </p>
          </div>

          {message && <div className="note info auth-note">{message}</div>}
          {error && <div className="note warn auth-note">{error}</div>}

          <form onSubmit={onSubmit}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="feedback-name">Your name</label>
                <input
                  id="feedback-name"
                  value={form.name}
                  onChange={(event) => onFieldChange("name", event.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div className="field">
                <label htmlFor="feedback-email">Your email</label>
                <input
                  id="feedback-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => onFieldChange("email", event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="feedback-customer">Customer ID (optional)</label>
                <input
                  id="feedback-customer"
                  value={form.customerCode}
                  onChange={(event) => onFieldChange("customerCode", event.target.value)}
                  placeholder="100001"
                />
              </div>
              <div className="field">
                <label htmlFor="feedback-phone">Phone (optional)</label>
                <input
                  id="feedback-phone"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => onFieldChange("phone", event.target.value)}
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="feedback-category">Feedback area</label>
                <select
                  id="feedback-category"
                  value={form.category}
                  onChange={(event) => onFieldChange("category", event.target.value)}
                >
                  {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="feedback-rating">Rating (optional)</label>
                <select
                  id="feedback-rating"
                  value={form.rating}
                  onChange={(event) => onFieldChange("rating", event.target.value)}
                >
                  <option value="">No rating</option>
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Good</option>
                  <option value="3">3 - Okay</option>
                  <option value="2">2 - Needs work</option>
                  <option value="1">1 - Blocked</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="feedback-message">Feedback</label>
              <textarea
                id="feedback-message"
                rows={5}
                value={form.message}
                onChange={(event) => onFieldChange("message", event.target.value)}
                placeholder="Tell us what happened, what you expected, or what would make this easier."
              />
            </div>

            <div className="field">
              <label htmlFor="feedback-attachments">Attachments (optional)</label>
              <input
                id="feedback-attachments"
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.doc,.docx"
                onChange={(event) => {
                  onAttachFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <div className="sub">Up to 3 files, 3 MB each. Screenshots are helpful for portal issues.</div>
              {form.attachments.length ? (
                <div className="attachment-list">
                  {form.attachments.map((attachment) => (
                    <div className="attachment-pill" key={attachment.id}>
                      <span>{attachment.fileName}</span>
                      <span className="sub">{formatFileSize(attachment.size)}</span>
                      <button type="button" onClick={() => onRemoveAttachment(attachment.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              className="btn btn-primary auth-submit"
              type="submit"
              disabled={submitting || !hasRequiredFields}
            >
              {submitting ? "Submitting…" : "Submit feedback"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function WorkflowStrip({ activeStep }) {
  const steps = [
    { key: "onboarding", label: "1. Onboard client" },
    { key: "invoice", label: "2. Create invoice" },
    { key: "payment", label: "3. Record payment" },
    { key: "receipt", label: "4. Send receipt" },
  ];

  return (
    <div className="workflow-strip">
      {steps.map((step) => (
        <div
          className={`workflow-step ${activeStep === step.key ? "active" : ""}`}
          key={step.key}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

function OnboardingView({
  contractUploads,
  customers,
  currentCustomer,
  currentHistory,
  counts,
  customerQuery,
  customerResults,
  form,
  needsFollowUp,
  onAddCustomService,
  onAddInvoiceScheduleEntry,
  onCriteriaChange,
  onContractUpload,
  onCustomerQueryChange,
  onCustomServiceChange,
  onFormChange,
  onInvoiceScheduleChange,
  onOpenConsole,
  onRemoveContract,
  onRemoveCustomService,
  onRemoveInvoiceScheduleEntry,
  onSelectCustomer,
  onSubmit,
  onToggleCriteria,
  referralProgram,
  saving,
  uploadingContract,
  zelleReadyCount,
}) {
  const customerSearchId = useId();
  const referralCustomerOptions = [...customers]
    .filter((customer) => customer.id !== currentCustomer?.id)
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedCriteriaCodes = new Set(form.criteriaSelections.map((selection) => selection.code));
  const selectedServiceCount = buildOnboardingServiceEntries(form).length;
  const invoiceScheduleTotal = form.invoiceSchedule.reduce(
    (sum, entry) => sum + Number(entry.amount || 0),
    0,
  );
  const hasRequiredFields =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.customerEmail.trim() &&
    form.customerPhone.trim() &&
    selectedServiceCount > 0;
  const historyHeading = currentCustomer
    ? `${formatCustomerReference(currentCustomer)} · ${currentCustomer.name} service history`
    : "Service history";

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Client onboarding</h1>
          <div className="sub">
            First step in the operating flow. Capture searchable identity details first, then record
            every enrolled service with its own date and time.
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={onOpenConsole}>
            Next: billing console <IconArrowRight size={14} />
          </button>
        </div>
      </div>
      <div className="content onboarding-content">
        <WorkflowStrip activeStep="onboarding" />

        <div className="metrics c3">
          <MetricCard accent label="Clients onboarded" value={counts.onboarded} />
          <MetricCard label="Zelle match identities captured" value={zelleReadyCount} />
          <MetricCard label="Needs intake follow-up" value={needsFollowUp} />
        </div>

        <div className="onboarding-layout">
          <section className="section no-gap">
            <div className="section-head">
              <h2>Client profile and enrollment</h2>
            </div>
            <div className="section-desc">
              Email, phone, first name, last name, and at least one service are required. Everything
              else is optional support data for billing and Zelle matching.
            </div>
            <div className="chart-card onboarding-card">
              <form onSubmit={onSubmit}>
                <div className="onboarding-block onboarding-contract-block">
                  <div className="onboarding-block-head">
                    <div>
                      <h3>1. Contract intake</h3>
                      <div className="sub">
                        Start here. Upload proposals, service agreements, and NDAs so Setu can
                        prefill services, fees, installments, and service-start dates before
                        onboarding is saved.
                      </div>
                    </div>
                    <label
                      className={`btn btn-sm btn-primary contract-upload-trigger ${uploadingContract ? "is-disabled" : ""}`}
                    >
                      <input
                        className="hidden-file-input"
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.html,.json"
                        multiple
                        onChange={(event) => {
                          void onContractUpload(event.target.files);
                          event.target.value = "";
                        }}
                        disabled={uploadingContract}
                      />
                      {uploadingContract ? "Reading contract…" : "Upload contract"}
                    </label>
                  </div>

                  <div className="autofill-note">
                    Contracts are stored with the customer record after onboarding is saved. Billing
                    agreements and proposals drive prefills, while NDAs stay attached as supporting
                    documents. On AWS, the same upload path can be directed into a private S3 bucket
                    by customer ID and date.
                  </div>

                  {contractUploads.length ? (
                    <div className="contract-upload-list">
                      {contractUploads.map((contract) => {
                        const parsed = contract.parsed ?? {};
                        const serviceSummary = summarizeServiceLabels(
                          parsed.services?.map(
                            (service) => service.name ?? service.shortLabel ?? service.longLabel ?? service,
                          ) ?? [],
                          6,
                        );

                        return (
                          <div className="contract-upload-card" key={contract.id}>
                            <div className="contract-upload-head">
                              <div>
                                <div className="cust">{contract.fileName}</div>
                                <div className="contract-badge-row">
                                  <span className="contract-kind-badge">
                                    {parsed.contractKindLabel ?? "Supporting document"}
                                  </span>
                                  <span className="contract-kind-note">{getContractUsageLabel(parsed)}</span>
                                </div>
                                <div className="sub">
                                  {(contract.sizeBytes / 1024).toFixed(1)} KB
                                  {parsed.contractDate ? ` · Contract ${formatShortDate(parsed.contractDate)}` : ""}
                                  {parsed.serviceStartDate
                                    ? ` · Start ${formatShortDate(parsed.serviceStartDate)}`
                                    : " · Start date not parsed yet"}
                                </div>
                              </div>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => onRemoveContract(contract.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="contract-upload-grid">
                              <div>
                                <div className="detail-label">Services</div>
                                <div className="contract-service-cloud">
                                  {serviceSummary.visible.length
                                    ? serviceSummary.visible.map((service) => (
                                        <span className="compact-service-pill" key={`${contract.id}-${service}`}>
                                          {service}
                                        </span>
                                      ))
                                    : <span className="sub">No services parsed yet</span>}
                                  {serviceSummary.overflowCount ? (
                                    <span className="compact-service-pill muted">
                                      +{serviceSummary.overflowCount} more
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div>
                                <div className="detail-label">Fee + installments</div>
                                <div className="sub">
                                  {parsed.totalFee
                                    ? `${formatCurrency(parsed.totalFee)} total fee`
                                    : "Total fee not parsed yet"}
                                  {Array.isArray(parsed.installments) && parsed.installments.length
                                    ? ` · ${parsed.installments.length} installment${
                                        parsed.installments.length === 1 ? "" : "s"
                                      }`
                                    : ""}
                                </div>
                              </div>
                            </div>
                            <div className="contract-upload-preview">
                              {contract.extractedTextPreview}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="picker-empty onboarding-inline-empty">
                      No contracts uploaded yet. You can still onboard manually, but contract-first
                      intake gives the cleanest prefills.
                    </div>
                  )}
                </div>

                <div className="field">
                  <label htmlFor={customerSearchId}>2. Existing client search</label>
                  <div className="search-wrap modal-search">
                    <IconSearch size={18} />
                    <input
                      id={customerSearchId}
                      className="search-input"
                      value={customerQuery}
                      onChange={(event) => onCustomerQueryChange(event.target.value)}
                      placeholder="Search by phone, email, first name, or last name"
                    />
                  </div>
                  {!customerQuery.trim() && !currentCustomer ? (
                    <div className="autofill-note">
                      Leave this blank for a brand-new client, or search to add later enrollments for an
                      existing member.
                    </div>
                  ) : null}
                  {currentCustomer ? (
                    <div className="picker-selected">
                      <div>
                        <div className="cust">{currentCustomer.name}</div>
                        <div className="sub">
                          Customer ID {formatCustomerReference(currentCustomer)} ·{" "}
                          Updating an existing profile. Only select services enrolled in this step;
                          earlier services stay in the history panel.
                        </div>
                      </div>
                      <button className="btn btn-sm" type="button" onClick={() => onSelectCustomer("")}>
                        Start new client
                      </button>
                    </div>
                  ) : null}
                  {customerQuery.trim() && !currentCustomer ? (
                    <div className="picker-results">
                      {customerResults.length ? (
                        customerResults.map((customer) => (
                          <button
                            className="picker-item"
                            key={customer.id}
                            type="button"
                            onClick={() => onSelectCustomer(customer.id)}
                          >
                            <div>
                              <div className="cust">{customer.name}</div>
                              <div className="sub">
                                Customer ID {formatCustomerReference(customer)} · {describeCustomerMatch(customer)} ·{" "}
                                {summarizeContacts(customer)}
                              </div>
                            </div>
                            <div className="picker-service-count">
                              {customer.services.length} service
                              {customer.services.length === 1 ? "" : "s"}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="picker-empty">No existing customer matches that search.</div>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>First name</label>
                    <input
                      value={form.firstName}
                      onChange={(event) => onFormChange("firstName", event.target.value)}
                      placeholder="Client first name"
                    />
                  </div>
                  <div className="field">
                    <label>Last name</label>
                    <input
                      value={form.lastName}
                      onChange={(event) => onFormChange("lastName", event.target.value)}
                      placeholder="Client last name"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Primary email</label>
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={(event) => onFormChange("customerEmail", event.target.value)}
                      placeholder="name@email.com"
                    />
                  </div>
                  <div className="field">
                    <label>Mobile phone</label>
                    <input
                      value={form.customerPhone}
                      onChange={(event) => onFormChange("customerPhone", event.target.value)}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Service start date</label>
                    <input
                      type="date"
                      value={form.serviceStartDate}
                      onChange={(event) => onFormChange("serviceStartDate", event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Onboarded date/time</label>
                    <input
                      type="datetime-local"
                      value={form.onboardedAt ? createDateTimeLocalValue(form.onboardedAt) : ""}
                      onChange={(event) =>
                        onFormChange(
                          "onboardedAt",
                          event.target.value ? new Date(event.target.value).toISOString() : "",
                        )
                      }
                    />
                  </div>
                </div>

                <div className="onboarding-block">
                  <div className="onboarding-block-head">
                    <div>
                      <h3>3. Services enrolled in this step</h3>
                      <div className="sub">
                        Select every EB1A criterion or custom service enrolled right now. Each one gets
                        its own timestamped history entry.
                      </div>
                    </div>
                    <span className="chip onboarding-chip">{selectedServiceCount} selected</span>
                  </div>

                  <div className="service-picker-list">
                    {EB1A_CRITERIA_OPTIONS.map((option) => {
                      const existingEnrollment = findExistingCriterionEnrollment(currentHistory, option);
                      const selected = selectedCriteriaCodes.has(option.code);
                      const selection = form.criteriaSelections.find(
                        (entry) => entry.code === option.code,
                      );

                      return (
                        <div
                          className={`service-picker-item ${selected ? "selected" : ""} ${existingEnrollment ? "locked" : ""}`}
                          key={option.code}
                        >
                          <label className="service-picker-check">
                            <input
                              type="checkbox"
                              checked={existingEnrollment ? true : selected}
                              disabled={Boolean(existingEnrollment)}
                              onChange={() => onToggleCriteria(option.code)}
                            />
                            <div className="service-picker-copy">
                              <div className="cust">{option.label}</div>
                              <div className="sub service-picker-caption">
                                {existingEnrollment
                                  ? `Recorded ${formatEnrollmentTimestamp(existingEnrollment.enrolledAt)}`
                                  : selected
                                    ? "Selected for this intake step"
                                    : "Tap to add in this intake step"}
                              </div>
                            </div>
                          </label>
                          {existingEnrollment ? (
                            <span className="history-pill">Recorded</span>
                          ) : selected ? (
                            <input
                              className="service-date-input"
                              type="datetime-local"
                              value={selection?.enrolledAt ?? createDateTimeLocalValue()}
                              onChange={(event) =>
                                onCriteriaChange(option.code, "enrolledAt", event.target.value)
                              }
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="custom-service-head">
                    <div>
                      <div className="cust">Custom services</div>
                      <div className="sub">
                        Use this when the enrolled service is not one of the default EB1A criteria.
                      </div>
                    </div>
                    <button className="btn btn-sm" type="button" onClick={onAddCustomService}>
                      <IconPlus size={14} />
                      Add custom
                    </button>
                  </div>

                  {form.customServices.length ? (
                    <div className="custom-service-list">
                      {form.customServices.map((service) => (
                        <div className="custom-service-row" key={service.id}>
                          <div className="field">
                            <label>Custom service name</label>
                            <input
                              value={service.name}
                              onChange={(event) =>
                                onCustomServiceChange(service.id, "name", event.target.value)
                              }
                              placeholder="Example: Media package or RFE support"
                            />
                          </div>
                          <div className="field">
                            <label>Enrolled date and time</label>
                            <input
                              type="datetime-local"
                              value={service.enrolledAt}
                              onChange={(event) =>
                                onCustomServiceChange(service.id, "enrolledAt", event.target.value)
                              }
                            />
                          </div>
                          <div className="custom-service-remove">
                            <button
                              className="btn btn-sm btn-ghost"
                              type="button"
                              onClick={() => onRemoveCustomService(service.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="picker-empty onboarding-inline-empty">
                      No custom services selected yet.
                    </div>
                  )}
                </div>

                <div className="onboarding-block">
                  <div className="onboarding-block-head">
                    <div>
                      <h3>4. Billing schedule</h3>
                      <div className="sub">
                        {form.feeType === "recurring"
                          ? "These rows become draft invoices for each recurring cycle you want generated now. Contracts can prefill the pattern, and admins can override any row."
                          : "These rows become draft invoices when onboarding is saved. Contract uploads prefill this automatically, and admins can override any field here."}
                      </div>
                    </div>
                    <div className="topbar-right">
                      <span className="chip onboarding-chip">{formatCurrency(invoiceScheduleTotal)}</span>
                      <button className="btn btn-sm" type="button" onClick={onAddInvoiceScheduleEntry}>
                        <IconPlus size={14} />
                        Add row
                      </button>
                    </div>
                  </div>

                  {form.invoiceSchedule.length ? (
                    <div className="invoice-schedule-list">
                      {form.invoiceSchedule.map((entry) => (
                        <div className="invoice-schedule-row" key={entry.id}>
                          <div className="field">
                            <label>Service</label>
                            <input
                              value={entry.serviceName}
                              onChange={(event) =>
                                onInvoiceScheduleChange(
                                  entry.id,
                                  "serviceName",
                                  normalizeServiceLabel(event.target.value),
                                )
                              }
                              placeholder="Authorship"
                            />
                          </div>
                          <div className="field">
                            <label>Milestone / installment</label>
                            <input
                              value={entry.milestone}
                              onChange={(event) =>
                                onInvoiceScheduleChange(entry.id, "milestone", event.target.value)
                              }
                              placeholder="Installment 1"
                            />
                          </div>
                          <div className="field">
                            <label>Amount</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry.amount}
                              onChange={(event) =>
                                onInvoiceScheduleChange(entry.id, "amount", event.target.value)
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Discount %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={entry.discountPct}
                              onChange={(event) =>
                                onInvoiceScheduleChange(entry.id, "discountPct", event.target.value)
                              }
                            />
                          </div>
                          <div className="field">
                            <label>Due date</label>
                            <input
                              type="date"
                              value={entry.dueDate}
                              onChange={(event) =>
                                onInvoiceScheduleChange(entry.id, "dueDate", event.target.value)
                              }
                            />
                          </div>
                          <div className="custom-service-remove">
                            <button
                              className="btn btn-sm btn-ghost"
                              type="button"
                              onClick={() => onRemoveInvoiceScheduleEntry(entry.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="picker-empty onboarding-inline-empty">
                      {form.feeType === "recurring"
                        ? "No recurring billing rows yet. Upload a contract or add the first cycles now."
                        : "No billing schedule rows yet. Upload a contract or add manual installments now."}
                    </div>
                  )}
                </div>

                <div className="onboarding-block">
                  <div className="onboarding-block-head">
                    <div>
                      <h3>5. Home address</h3>
                      <div className="sub">Optional, but useful for complete client records.</div>
                    </div>
                  </div>
                  <div className="field">
                    <label>Address line 1</label>
                    <input
                      value={form.homeAddressLine1}
                      onChange={(event) => onFormChange("homeAddressLine1", event.target.value)}
                      placeholder="Street address"
                    />
                  </div>
                  <div className="field">
                    <label>Address line 2</label>
                    <input
                      value={form.homeAddressLine2}
                      onChange={(event) => onFormChange("homeAddressLine2", event.target.value)}
                      placeholder="Apartment, suite, unit, building"
                    />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>City</label>
                      <input
                        value={form.homeCity}
                        onChange={(event) => onFormChange("homeCity", event.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div className="field">
                      <label>State / province</label>
                      <input
                        value={form.homeState}
                        onChange={(event) => onFormChange("homeState", event.target.value)}
                        placeholder="State"
                      />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Postal code</label>
                      <input
                        value={form.homePostalCode}
                        onChange={(event) => onFormChange("homePostalCode", event.target.value)}
                        placeholder="ZIP or postal code"
                      />
                    </div>
                    <div className="field">
                      <label>Country</label>
                      <input
                        value={form.homeCountry}
                        onChange={(event) => onFormChange("homeCountry", event.target.value)}
                        placeholder="Country"
                      />
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Fee type</label>
                    <select
                      value={form.feeType}
                      onChange={(event) => onFormChange("feeType", event.target.value)}
                    >
                      {FEE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Preferred payment method</label>
                    <select
                      value={form.preferredPaymentMethod}
                      onChange={(event) => onFormChange("preferredPaymentMethod", event.target.value)}
                    >
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Billing cadence</label>
                    <select
                      value={form.billingCadence}
                      onChange={(event) => onFormChange("billingCadence", event.target.value)}
                    >
                      {getBillingCadenceOptions(form.feeType).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Billing behavior</label>
                    <div className="picker-empty onboarding-inline-empty">
                      {form.feeType === "recurring"
                        ? "Recurring billing keeps cadence-driven cycles together. Add one row per cycle you want created now."
                        : "One-time billing supports a single fee or multiple milestone/installment rows for the same engagement."}
                    </div>
                  </div>
                </div>

                <div className="note info onboarding-note">
                  <IconMail size={16} />
                  <div>
                    Optional Zelle identity details help the Gmail sync recognize the sender more
                    accurately later.
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Zelle sender name</label>
                    <input
                      value={form.zelleSenderName}
                      onChange={(event) => onFormChange("zelleSenderName", event.target.value)}
                      placeholder="How their payment name appears"
                    />
                  </div>
                  <div className="field">
                    <label>Zelle sender email</label>
                    <input
                      type="email"
                      value={form.zelleSenderEmail}
                      onChange={(event) => onFormChange("zelleSenderEmail", event.target.value)}
                      placeholder="Optional payment email"
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Zelle phone last 4</label>
                    <input
                      value={form.zelleSenderPhoneLast4}
                      maxLength={4}
                      onChange={(event) =>
                        onFormChange(
                          "zelleSenderPhoneLast4",
                          event.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      placeholder="4471"
                    />
                  </div>
                  <div className="field">
                    <label>Referred by existing client</label>
                    <select
                      value={form.referringCustomerId}
                      onChange={(event) => onFormChange("referringCustomerId", event.target.value)}
                      disabled={!referralProgram.enabled}
                    >
                      <option value="">No linked referrer</option>
                      {referralCustomerOptions.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {formatCustomerReference(customer)} · {customer.name}
                        </option>
                      ))}
                    </select>
                    <div className="autofill-note">
                      {referralProgram.enabled
                        ? `${referralProgram.programName}: ${formatCurrency(
                            referralProgram.bonusAmount,
                          )} after ${formatCurrency(referralProgram.qualifyingPaidAmount)} paid or ${referralProgram.qualificationMonths} months.`
                        : "Referral program is disabled for new enrollments right now."}
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label>Referral relationship</label>
                    <select
                      value={form.referralRelationship}
                      onChange={(event) => onFormChange("referralRelationship", event.target.value)}
                      disabled={!form.referringCustomerId}
                    >
                      {REFERRAL_RELATIONSHIP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="autofill-note">
                      Capture whether the lead came from a friend, family member, colleague, or another relationship so reporting stays readable later.
                    </div>
                  </div>
                  <div className="field">
                    <label>Referral source</label>
                    <input
                      value={form.referralSource}
                      onChange={(event) => onFormChange("referralSource", event.target.value)}
                      placeholder="Referral, direct, website, partner…"
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Billing notes</label>
                  <textarea
                    value={form.billingNotes}
                    onChange={(event) => onFormChange("billingNotes", event.target.value)}
                    placeholder="Anything finance ops should know before the first invoice goes out"
                    rows={4}
                  />
                </div>

                <div className="onboarding-actions">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={saving || uploadingContract || !hasRequiredFields}
                  >
                    {saving
                      ? "Saving…"
                      : uploadingContract
                        ? "Waiting for contract…"
                      : currentCustomer
                        ? "Save profile + enroll services"
                        : "Onboard client"}
                  </button>
                  <div className="autofill-note">
                    Required first step for clean invoicing, payment matching, and receipts.
                  </div>
                </div>
              </form>
            </div>
          </section>

          {currentCustomer ? (
            <section className="section no-gap">
            <div className="section-head">
              <h2>{historyHeading}</h2>
            </div>
            <div className="section-desc">
              Every service enrollment is preserved with its own recorded timestamp so later add-ons
              stay traceable.
            </div>
            <div className="tcard">
              {currentHistory.length ? (
                currentHistory.map((service) => (
                  <div className="history-row" key={service.id}>
                    <div className="result-copy">
                      <div className="cust">{normalizeServiceLabel(service.name)}</div>
                      <div className="sub">
                        {service.isCustom ? "Custom service" : service.code ? "EB1A criterion" : "Service"}
                      </div>
                    </div>
                    <div className="result-meta">
                      <div className="mono">{formatEnrollmentTimestamp(service.enrolledAt)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">
                  <IconCalendar size={14} />
                  Select an existing client to review their service history, or create a new record now.
                </div>
              )}
            </div>
          </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TransactionTrendSection({ payments }) {
  const [filter, setFilter] = useState("month");
  const trend = buildTransactionTrend(payments, filter);
  const chartWidth = 680;
  const chartHeight = 240;
  const paddingLeft = 12;
  const paddingRight = 12;
  const paddingTop = 16;
  const paddingBottom = 28;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const chartPoints = trend.buckets.map((bucket, index) => {
    const ratio = trend.maxAmount <= 0 ? 0 : bucket.amount / trend.maxAmount;
    const x =
      trend.buckets.length === 1
        ? paddingLeft + innerWidth / 2
        : paddingLeft + (innerWidth * index) / (trend.buckets.length - 1);
    const y = paddingTop + innerHeight - ratio * innerHeight;
    return {
      ...bucket,
      x,
      y,
    };
  });
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints.at(-1).x.toFixed(2)} ${(paddingTop + innerHeight).toFixed(2)} L ${
        chartPoints[0].x
      .toFixed(2)} ${(paddingTop + innerHeight).toFixed(2)} Z`
    : "";
  const gridValues = [trend.maxAmount, trend.maxAmount / 2, 0];
  const transactionLabel = `${trend.totals.count} saved transaction${trend.totals.count === 1 ? "" : "s"} in view`;
  const latestActivityLabel = trend.latestNonZeroBucket
    ? `Latest activity: ${trend.latestNonZeroBucket.detailLabel} · ${formatCurrency(
        trend.latestNonZeroBucket.amount,
      )}`
    : `No received amounts in this ${trend.rangeLabel.toLowerCase()} range yet`;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Amounts received over time</h2>
        <div className="trend-filter-row">
          {DASHBOARD_TRANSACTION_FILTERS.map((option) => (
            <button
              className={`trend-filter ${option.key === filter ? "active" : ""}`}
              key={option.key}
              onClick={() => setFilter(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="section-desc">
        X-axis shows {trend.rangeLabel.toLowerCase()} periods. Y-axis shows the sum of saved
        amounts received. Duplicate-blocked transactions stay out of these totals.
      </div>
      <div className="chart-card trend-card">
        <div className="trend-summary-bar">
          <div>
            <div className="trend-summary-label">{trend.windowLabel}</div>
            <div className="trend-summary-value">{formatCurrency(trend.totals.amount)}</div>
          </div>
          <div className="trend-summary-meta">
            <div>{transactionLabel}</div>
            <div>{latestActivityLabel}</div>
          </div>
        </div>

        {trend.empty ? (
          <div className="empty">
            <IconCheck size={14} />
            No transactions saved yet
          </div>
        ) : (
          <div className="trend-chart">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ba7517" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#ba7517" stopOpacity="0" />
                </linearGradient>
              </defs>

              {gridValues.map((value) => {
                const y =
                  paddingTop +
                  innerHeight -
                  (trend.maxAmount <= 0 ? 0 : (value / trend.maxAmount) * innerHeight);
                return (
                  <g key={value}>
                    <line
                      className="trend-grid-line"
                      x1={paddingLeft}
                      x2={chartWidth - paddingRight}
                      y1={y}
                      y2={y}
                    />
                    <text className="trend-grid-text" x={paddingLeft} y={y - 6}>
                      {formatCompactCurrency(value)}
                    </text>
                  </g>
                );
              })}

              <path className="trend-area" d={areaPath} />
              <path className="trend-line" d={linePath} />

              {chartPoints.map((point) => (
                <circle
                  className={`trend-point ${point.count ? "active" : ""}`}
                  cx={point.x}
                  cy={point.y}
                  key={`${point.index}-${point.axisLabel}`}
                  r={point.count ? 4 : 2.8}
                />
              ))}

              {trend.labelIndices.map((index) => {
                const point = chartPoints[index];
                if (!point) {
                  return null;
                }

                return (
                  <text
                    className="trend-axis-text"
                    key={`axis-${index}`}
                    x={point.x}
                    y={chartHeight - 6}
                    textAnchor={
                      index === 0 ? "start" : index === chartPoints.length - 1 ? "end" : "middle"
                    }
                  >
                    {trend.buckets[index].axisLabel}
                  </text>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}

function ReferralProgramTrendSection({ trend, referrals, rewards }) {
  const maxSpent = trend?.maxBonusSpent || 1;

  return (
    <section className="section no-gap">
      <div className="section-head">
        <h2>Referral program trend</h2>
      </div>
      <div className="section-desc">
        Referrals created and bonus dollars already spent through invoice discounts over the last 12
        months.
      </div>
      <div className="chart-card referral-chart-card">
        <div className="trend-summary-strip">
          <div>
            <div className="detail-label">Relationships tracked</div>
            <div className="cust">{referrals.length}</div>
          </div>
          <div>
            <div className="detail-label">Bonuses applied</div>
            <div className="cust">{rewards.filter((reward) => reward.status === "applied").length}</div>
          </div>
          <div>
            <div className="detail-label">Total bonus spent</div>
            <div className="cust">{formatCurrency(trend?.totals?.bonusSpent ?? 0)}</div>
          </div>
        </div>
        {trend?.empty ? (
          <div className="empty">
            <IconCheck size={14} />
            No referral activity recorded yet
          </div>
        ) : (
          <div className="referral-bars">
            {trend.buckets.map((bucket) => {
              const height = maxSpent > 0 ? (bucket.bonusSpent / maxSpent) * 100 : 0;
              return (
                <div className="referral-bar-col" key={`${bucket.key}`}>
                  <div className="referral-count-pill">
                    {bucket.referralCount ? `${bucket.referralCount} referral${bucket.referralCount === 1 ? "" : "s"}` : "0 referrals"}
                  </div>
                  <div className="referral-bar-track">
                    <div
                      className="referral-bar-fill"
                      style={{ height: bucket.bonusSpent ? `${Math.max(height, 4)}%` : "0%" }}
                    />
                  </div>
                  <div className="referral-bar-amount">{bucket.bonusSpent ? formatCompactCurrency(bucket.bonusSpent) : "$0"}</div>
                  <div className="bar-label">{bucket.axisLabel}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function DashboardView({
  dashboard,
  payments,
  referrals,
  rewards,
  referralTrend,
  needsAttention,
  onOpenConsole,
  onOpenOnboarding,
}) {
  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Executive dashboard</h1>
          <div className="sub">
            {dashboard.dateLabel} · month to date · summary view
          </div>
        </div>
        <div className="topbar-right">
          <span className="chip">
            <IconCalendar size={14} />
            {dashboard.periodLabel}
          </span>
          <button className="btn btn-sm">Export</button>
        </div>
      </div>
      <div className="content">
        <div className="metrics c5">
          <MetricCard
            accent
            label="Collected (month to date)"
            value={formatCurrency(dashboard.metrics.collected)}
            deltaIcon={<IconTrendingUp size={13} />}
            delta="12% vs April"
            deltaTone="up"
          />
          <MetricCard
            label="Outstanding"
            value={formatCurrency(dashboard.metrics.outstanding)}
            deltaIcon={<IconAlertTriangle size={13} />}
            delta="4 invoices overdue"
            deltaTone="down"
          />
          <MetricCard
            label="Expected (next 30 days)"
            value={formatCurrency(dashboard.metrics.expected)}
            delta="from schedule"
          />
          <MetricCard
            label="Auto-match rate"
            value={dashboard.metrics.autoMatchRate}
            deltaIcon={<IconTrendingUp size={13} />}
            delta="6 pts since launch"
            deltaTone="up"
          />
        </div>

        <TransactionTrendSection payments={payments} />

        <ReferralProgramTrendSection trend={referralTrend} referrals={referrals} rewards={rewards} />

        <div className="two-col">
          <section className="section no-gap">
            <div className="section-head">
              <h2>Collections by month</h2>
            </div>
            <div className="section-desc">Zelle vs card, last 6 months</div>
            <div className="chart-card">
              <div className="bars">
                {dashboard.chartData.map((item) => {
                  const max = 32;
                  const zelleHeight = (item.zelle / max) * 100;
                  const stripeHeight = (item.stripe / max) * 100;
                  return (
                    <div className="bar-col" key={item.month}>
                      <div className="bar-stack">
                        <div className="bar-seg bar-stripe" style={{ height: `${stripeHeight}%` }} />
                        <div className="bar-seg bar-zelle" style={{ height: `${zelleHeight}%` }} />
                      </div>
                      <div className="bar-label">{item.month}</div>
                    </div>
                  );
                })}
              </div>
              <div className="legend">
                <span>
                  <span className="sw bar-zelle" />
                  Zelle (discounted)
                </span>
                <span>
                  <span className="sw bar-stripe" />
                  Card (Stripe)
                </span>
              </div>
            </div>
          </section>

          <section className="section no-gap">
            <div className="section-head">
              <h2>Receivables aging</h2>
            </div>
            <div className="section-desc">Outstanding by age</div>
            <div className="chart-card">
              {dashboard.aging.map((bucket) => (
                <div className="age-row" key={bucket.label}>
                  <span className="age-label">{bucket.label}</span>
                  <div className="age-bar-track">
                    <div
                      className={`age-bar-fill ${bucket.tone}`}
                      style={{ width: `${bucket.width}%` }}
                    />
                  </div>
                  <span className="age-val">{formatCurrency(bucket.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="section section-gap">
          <div className="section-head">
            <h2>Needs attention</h2>
            <div className="topbar-right">
              <button className="btn btn-sm" onClick={onOpenOnboarding}>
                Onboard client
              </button>
              <button className="btn btn-sm btn-ghost" onClick={onOpenConsole}>
                Open console <IconArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="section-desc">
            Items that need a decision before they affect cash flow
          </div>
          <div className="tcard">
            <div className="trow head attention-grid">
              <div />
              <div>Item</div>
              <div>Customer</div>
              <div>Impact</div>
              <div />
            </div>
            {needsAttention.map((item) => (
              <div className={`trow attention-grid ${item.attn ? "attn" : ""}`} key={item.id}>
                <div>{item.icon}</div>
                <div className="cust">{item.label}</div>
                <div>{item.customer}</div>
                <div className="sub">{item.impact}</div>
                <div>
                  <button className="btn btn-sm" onClick={onOpenConsole}>
                    {item.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="metrics c3">
          <MetricCard
            label="Avg days to pay"
            value={dashboard.metrics.avgDaysToPay}
            deltaIcon={<IconTrendingDown size={13} />}
            delta="1.1 days faster"
            deltaTone="up"
          />
          <MetricCard
            label="Active customers"
            value={dashboard.metrics.activeCustomers}
            delta="6 new this month"
          />
          <MetricCard
            label="Manual touches saved"
            value={dashboard.metrics.manualHoursSaved}
            deltaIcon={<IconTrendingUp size={13} />}
            delta="this month vs Bloom"
            deltaTone="up"
          />
        </div>
      </div>
    </div>
  );
}

function ClientsHubView({
  counts,
  customers,
  dueInvoices,
  pendingPayments,
  exceptions,
  onOpenCustomer,
  onOpenOnboarding,
  onOpenRegister,
}) {
  const recentCustomers = [...customers]
    .sort((left, right) => getComparableTime(right.profile?.onboardedAt) - getComparableTime(left.profile?.onboardedAt))
    .slice(0, 8);
  const customersWithWork = new Set([
    ...dueInvoices.map((invoice) => invoice.customerId),
    ...pendingPayments.map((payment) => payment.customerId),
    ...exceptions.map((exception) => exception.customerId).filter(Boolean),
  ]);

  return (
    <div>
      <div className="content">
        <div className="ia-hero">
          <div>
            <div className="detail-label">Clients</div>
            <h2>Contract-first intake, register, and customer 360 now live in one section.</h2>
            <p>
              This wraps the existing onboarding and search pages, so contract parsing, service
              prefill, customer IDs, and 360 history continue using the current backend paths.
            </p>
          </div>
          <div className="ia-hero-actions">
            <button className="btn btn-primary" onClick={onOpenOnboarding}>
              Upload contract / onboard
            </button>
            <button className="btn" onClick={onOpenRegister}>
              Open customer register
            </button>
          </div>
        </div>

        <div className="metrics c4">
          <MetricCard accent label="Clients" value={counts.onboarded} delta="current customer records" />
          <MetricCard label="Draft invoices" value={counts.due} delta="ready in Receivables" />
          <MetricCard label="Payments matched" value={counts.confirm} delta="waiting for review" />
          <MetricCard label="Client exceptions" value={counts.exceptions} delta="need human decision" />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Recent clients</h2>
            <button className="btn btn-sm btn-ghost" onClick={onOpenRegister}>
              Search all <IconArrowRight size={14} />
            </button>
          </div>
          <div className="section-desc">
            Click a row to open the existing full 360 page with contracts, services, invoices,
            payments, referrals, and history.
          </div>
          <div className="tcard">
            <div className="trow head clients-hub-grid">
              <div>Customer</div>
              <div>Primary contact</div>
              <div>Services</div>
              <div>Status</div>
            </div>
            {recentCustomers.map((customer) => (
              <button className="trow clients-hub-grid trow-button" key={customer.id} onClick={() => onOpenCustomer(customer)}>
                <div>
                  <div className="cust">{customer.name}</div>
                  <div className="sub mono">{customer.customerCode ?? customer.id}</div>
                </div>
                <div className="sub">
                  {getPrimaryCustomerEmail(customer)}
                  <br />
                  {getPrimaryCustomerPhone(customer)}
                </div>
                <div className="sub">
                  {summarizeCustomerServices(customer).primary}
                  <br />
                  {summarizeCustomerServices(customer).detail}
                </div>
                <div>
                  <span className={`search-status-chip tone-${customersWithWork.has(customer.id) ? "warn" : "success"}`}>
                    {customersWithWork.has(customer.id) ? "Active work" : "Current"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PayablesHubView({ invoices, referrals, rewards, onOpenReceivables, onOpenReferrals }) {
  const availableRewards = rewards.filter((reward) => reward.status === "available");
  const appliedRewards = rewards.filter((reward) => reward.status === "applied");
  const referralDiscountInvoices = invoices.filter((invoice) => Number(invoice.referralBonusAmount || 0) > 0);
  const availableRewardTotal = availableRewards.reduce((total, reward) => total + Number(reward.amount || 0), 0);
  const appliedRewardTotal = appliedRewards.reduce((total, reward) => total + Number(reward.amount || 0), 0);
  const verifiedReferrals = referrals.filter((referral) => referral.legitimacyStatus === "verified");

  return (
    <div>
      <div className="content">
        <div className="ia-hero">
          <div>
            <div className="detail-label">Payables</div>
            <h2>Money-out foundation, with client referral discounts kept on the existing invoice path.</h2>
            <p>
              This section is the v2 home for future bonuses-to-pay, payroll, vendor bills,
              reimbursements, and expenses. Today it reads the live referral reward ledger without
              rerouting customer referral discounts.
            </p>
          </div>
          <div className="ia-hero-actions">
            <button className="btn btn-primary" onClick={onOpenReferrals}>
              Open referral rewards
            </button>
            <button className="btn" onClick={onOpenReceivables}>
              Open invoices
            </button>
          </div>
        </div>

        <div className="metrics c4">
          <MetricCard accent label="Available discounts" value={formatCurrency(availableRewardTotal)} delta={`${availableRewards.length} rewards`} />
          <MetricCard label="Applied discounts" value={formatCurrency(appliedRewardTotal)} delta={`${appliedRewards.length} rewards`} />
          <MetricCard label="Invoices discounted" value={referralDiscountInvoices.length} delta="via referral_bonus_amount" />
          <MetricCard label="Verified referrals" value={verifiedReferrals.length} delta="eligible client path" />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Current payable categories</h2>
          </div>
          <div className="section-desc">
            Phase-safe view of the v2 payables IA. Cash payouts, payroll, vendor bills, reimbursements,
            and Excel expenses remain future additive phases.
          </div>
          <div className="ia-card-grid">
            {[
              ["Referral payouts", "Future cash payout queue for employee and partner referrers.", "Future"],
              ["Client invoice discounts", "Live today through customer_reward_ledger and invoice_reward_applications.", "Live"],
              ["Payroll", "Future employee payables source.", "Planned"],
              ["Vendor bills", "Future AP ledger category.", "Planned"],
              ["Reimbursements", "Future employee reimbursement queue.", "Planned"],
              ["Expenses", "Future Excel import into payables.", "Planned"],
            ].map(([title, copy, status]) => (
              <div className="detail-card ia-mini-card" key={title}>
                <div className="detail-inline-head">
                  <div>
                    <div className="detail-title">{title}</div>
                    <div className="sub">{copy}</div>
                  </div>
                  <span className={`search-status-chip tone-${status === "Live" ? "success" : "neutral"}`}>{status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PeopleHubView({ customers, referralParties, referrals, onOpenClients, onOpenReferrals }) {
  const clientParties = referralParties.filter((party) => party.partyType === "client");
  const customerReferrers = new Set(referrals.map((referral) => referral.referrerCustomerId).filter(Boolean));

  return (
    <div>
      <div className="content">
        <div className="ia-hero">
          <div>
            <div className="detail-label">People</div>
            <h2>Future employee and sales directory, connected to today&apos;s customer referrers.</h2>
            <p>
              The v2 design expands referral parties beyond clients. This local build shows the
              current normalized referral parties while preserving customer records as the source of truth.
            </p>
          </div>
          <div className="ia-hero-actions">
            <button className="btn btn-primary" onClick={onOpenReferrals}>
              Review referrals
            </button>
            <button className="btn" onClick={onOpenClients}>
              Open clients
            </button>
          </div>
        </div>

        <div className="metrics c3">
          <MetricCard accent label="Referral parties" value={referralParties.length} delta="normalized records" />
          <MetricCard label="Client parties" value={clientParties.length} delta="invoice discount path" />
          <MetricCard label="Customer referrers" value={customerReferrers.size} delta="legacy ID preserved" />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Current referral parties</h2>
          </div>
          <div className="section-desc">
            Employee, sales, and partner directories are planned as additive phases. Existing client
            referrers are already normalized here.
          </div>
          <div className="tcard">
            <div className="trow head people-grid">
              <div>Party</div>
              <div>Type</div>
              <div>Linked customer</div>
              <div>Referral code</div>
            </div>
            {referralParties.map((party) => (
              <div className="trow people-grid" key={party.id}>
                <div>
                  <div className="cust">{party.displayName}</div>
                  <div className="sub">{party.email ?? "No email captured"}</div>
                </div>
                <div><span className="search-status-chip tone-success">{party.partyType}</span></div>
                <div className="sub">{party.customerName ?? customers.find((customer) => customer.id === party.customerId)?.name ?? "Not linked"}</div>
                <div className="mono">{party.referralCode ?? "Not minted"}</div>
              </div>
            ))}
            {!referralParties.length && <div className="empty">No referral parties have been created yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatAuthAuditEventLabel(eventType) {
  return String(eventType || "auth_event")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getAuthAuditOutcomeTone(outcome) {
  if (outcome === "success") {
    return "success";
  }
  if (outcome === "failure") {
    return "danger";
  }
  return "neutral";
}

function AuditHubView({ activity, authAuditEvents, exceptionHistory, referralEvents, onOpenReceivables, onOpenReferrals }) {
  const latestActivity = [...activity].slice(0, 8);
  const latestAuthAuditEvents = [...authAuditEvents].slice(0, 10);
  const latestReferralEvents = [...referralEvents].slice(0, 8);
  const latestExceptions = [...exceptionHistory].slice(0, 6);

  return (
    <div>
      <div className="content">
        <div className="ia-hero">
          <div>
            <div className="detail-label">Audit</div>
            <h2>One place to explain what happened, who did it, and when.</h2>
            <p>
              This combines the existing human-readable activity feed with resolved exception history
              and the new structured referral event trail.
            </p>
          </div>
          <div className="ia-hero-actions">
            <button className="btn btn-primary" onClick={onOpenReceivables}>
              Receivables history
            </button>
            <button className="btn" onClick={onOpenReferrals}>
              Referral history
            </button>
          </div>
        </div>

        <div className="metrics c3">
          <MetricCard accent label="Security events" value={authAuditEvents.length} delta="login + API-key checks" />
          <MetricCard label="Activity items" value={activity.length} delta="global feed" />
          <MetricCard label="Resolved exceptions" value={exceptionHistory.length} delta="actor retained" />
        </div>

        <section className="section">
          <div className="section-head"><h2>Security auth events</h2></div>
          <div className="section-desc">
            Login, logout, and integration API-key checks are recorded here without passwords,
            tokens, API-key values, or raw IP/user-agent strings.
          </div>
          <div className="tcard">
            {latestAuthAuditEvents.map((event) => (
              <div className="audit-row audit-row-wide" key={event.id}>
                <span className="mono">{formatDateTimeValue(event.createdAt)}</span>
                <div>
                  <div className="detail-inline-head audit-inline-head">
                    <div>
                      <div className="cust">{formatAuthAuditEventLabel(event.eventType)}</div>
                      <div className="sub">
                        {event.username ?? event.actorUsername ?? "system"} · {event.requestMethod ?? "HTTP"} {event.requestPath ?? "unknown path"}
                      </div>
                    </div>
                    <span className={`search-status-chip tone-${getAuthAuditOutcomeTone(event.outcome)}`}>
                      {event.outcome}
                    </span>
                  </div>
                  <div className="sub">
                    IP hash {event.ipHashPreview ?? "not captured"} · User-agent hash {event.userAgentHashPreview ?? "not captured"}
                  </div>
                </div>
              </div>
            ))}
            {!latestAuthAuditEvents.length && <div className="empty">No auth audit events have been recorded yet.</div>}
          </div>
        </section>

        <div className="two-col">
          <section className="section no-gap">
            <div className="section-head"><h2>Referral events</h2></div>
            <div className="tcard">
              {latestReferralEvents.map((event) => (
                <div className="audit-row" key={event.id}>
                  <span className="mono">{formatDateTimeValue(event.createdAt)}</span>
                  <div>
                    <div className="cust">{event.eventType}</div>
                    <div className="sub">{event.referralCode ?? event.referralId ?? "No referral code"} · {event.actorUsername ?? event.actorKind}</div>
                  </div>
                </div>
              ))}
              {!latestReferralEvents.length && <div className="empty">No referral events yet.</div>}
            </div>
          </section>
          <section className="section no-gap">
            <div className="section-head"><h2>Finance activity</h2></div>
            <div className="tcard">
              {latestActivity.map((item) => (
                <div className="audit-row" key={item.id}>
                  <span className="mono">{item.actorUsername ?? "system"}</span>
                  <div>
                    <div className="cust">{item.label}</div>
                    <div className="sub">Activity event</div>
                  </div>
                </div>
              ))}
              {!latestActivity.length && <div className="empty">No activity yet.</div>}
            </div>
          </section>
        </div>

        <section className="section section-gap">
          <div className="section-head"><h2>Resolved exception history</h2></div>
          <div className="tcard">
            {latestExceptions.map((item) => (
              <div className="audit-row audit-row-wide" key={item.id}>
                <span className="mono">{formatDateTimeValue(item.resolvedAt)}</span>
                <div>
                  <div className="cust">{formatExceptionResolutionAction(item.resolutionAction)}</div>
                  <div className="sub">
                    {item.senderName} · {item.resolvedCustomerName ?? "No customer linked"} · by {item.resolvedByUsername ?? "unknown"}
                  </div>
                </div>
              </div>
            ))}
            {!latestExceptions.length && <div className="empty">No resolved exceptions yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function ConsoleView({
  activeTab = "Overview",
  onTabChange = () => {},
  counts,
  dueInvoices,
  integrationStatus,
  pendingPayments,
  payments,
  exceptions,
  archivedExceptions = [],
  exceptionHistory,
  onOpenPayment,
  onOpenNewInvoice,
  onOpenManualPayment,
  onSendAll,
  onPreviewInvoice,
  onConfirmPayment,
  onConfirmAll,
  onSendReceipt,
  onSyncInbox,
  onOpenMismatch,
  onOpenExceptionReview,
  onOpenArchivedDelete,
  sendingReceiptId,
  syncingInbox,
}) {
  const emailConfigured = integrationStatus?.email?.configured ?? false;
  const gmailConfigured = integrationStatus?.gmail?.configured ?? false;
  const gmailAuthorized = integrationStatus?.gmail?.authorized ?? false;
  const gmailSyncAt = integrationStatus?.gmail?.lastSyncAt;
  const gmailAutoSync = integrationStatus?.gmail?.autoSync;
  const gmailAutoSyncActive = Boolean(gmailAutoSync?.active);
  const gmailAutoSyncLabel = gmailAutoSyncActive
    ? `Auto sync ${gmailAutoSync.intervalMinutes || 5} min`
    : "Auto sync paused";
  const gmailNextSyncAt = gmailAutoSync?.nextRunAt;
  const completedPayments = [...payments]
    .filter((payment) => payment.appliedAt)
    .sort(
      (left, right) =>
        getComparableTime(right.appliedAt, right.transactionDate, right.receivedAt) -
        getComparableTime(left.appliedAt, left.transactionDate, left.receivedAt),
    );
  const recentExceptionHistory = [...(exceptionHistory ?? [])]
    .sort((left, right) => getComparableTime(right.resolvedAt) - getComparableTime(left.resolvedAt))
    .slice(0, 8);
  const receivablesTabs = [
    { label: "Overview", count: null },
    { label: "Invoices", count: dueInvoices.length },
    { label: "Payments to confirm", count: pendingPayments.length },
    { label: "Exceptions", count: exceptions.length },
    { label: "Receipts", count: completedPayments.length },
    { label: "Inbox sync", count: null },
  ];
  const currentTab = receivablesTabs.some((tab) => tab.label === activeTab) ? activeTab : "Overview";
  const inboxSyncCopy = gmailConfigured
    ? gmailAuthorized
      ? "Gmail is authorized for Zelle subject-only sync."
      : "Gmail is configured but needs reauthorization before sync can run."
    : "Gmail is not configured yet.";

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Receivables</h1>
          <div className="sub">Invoices, Zelle payments, exceptions, receipts, and inbox sync.</div>
        </div>
        <div className="topbar-right">
          <span className="chip">
            <IconTable size={14} />
            Linked to schedule sheet
          </span>
          <span className="chip">
            <IconMail size={14} />
            {emailConfigured ? "Email ready" : "Email not configured"}
          </span>
          <span className="chip">
            <IconSearch size={14} />
            {gmailConfigured
              ? gmailAuthorized
                ? "Gmail authorized"
                : "Gmail needs auth"
              : "Gmail not configured"}
          </span>
          <span className="chip">
            <IconRefresh size={14} />
            {gmailAutoSyncLabel}
          </span>
          <button className="btn btn-sm" onClick={onSyncInbox} disabled={syncingInbox}>
            <IconRefresh size={14} />
            {syncingInbox ? "Syncing…" : "Sync Zelle inbox"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenNewInvoice}>
            <IconPlus size={14} />
            New invoice
          </button>
          <button className="btn btn-sm" onClick={onOpenManualPayment}>
            <IconCircleCheckFilled size={14} />
            Record manual payment
          </button>
        </div>
      </div>
      <div className="content">
        <div className="finance-tabs" role="tablist" aria-label="Receivables workspace">
          {receivablesTabs.map((tab) => (
            <button
              className={`finance-tab ${currentTab === tab.label ? "active" : ""}`}
              key={tab.label}
              onClick={() => onTabChange(tab.label)}
              role="tab"
              type="button"
              aria-selected={currentTab === tab.label}
            >
              {tab.label}
              {typeof tab.count === "number" && <span>{tab.count}</span>}
            </button>
          ))}
        </div>

        {currentTab === "Overview" && (
          <>
            <div className="metrics c3">
              <MetricCard accent label="Invoices due to send" value={counts.due} />
              <MetricCard label="Payments to confirm" value={counts.confirm} />
              <MetricCard label="Exceptions" value={counts.exceptions} />
            </div>

            <section className="section">
              <div className="section-head">
                <h2>Receivables command center</h2>
                <button className="btn btn-sm" onClick={onSyncInbox} disabled={syncingInbox}>
                  <IconRefresh size={14} />
                  {syncingInbox ? "Syncing..." : "Run inbox sync"}
                </button>
              </div>
              <div className="section-desc">
                Move through the same operational flow as the wireframe: generate invoices, confirm
                money received, resolve exceptions, then send receipts.
              </div>
              <div className="receivables-command-grid">
                <button className="detail-card receivables-command-card" onClick={() => onTabChange("Invoices")} type="button">
                  <div className="detail-label">1. Invoice queue</div>
                  <div className="detail-title">{counts.due} ready to send</div>
                  <div className="sub">Scheduled invoices and referral-discounted invoices remain on the existing send path.</div>
                </button>
                <button className="detail-card receivables-command-card" onClick={() => onTabChange("Payments to confirm")} type="button">
                  <div className="detail-label">2. Payment review</div>
                  <div className="detail-title">{counts.confirm} matched payments</div>
                  <div className="sub">Apply high-confidence Zelle or manual payments before any receipt is sent.</div>
                </button>
                <button className="detail-card receivables-command-card" onClick={() => onTabChange("Exceptions")} type="button">
                  <div className="detail-label">3. Exceptions</div>
                  <div className="detail-title">{counts.exceptions} need decision</div>
                  <div className="sub">Manual review, duplicate protection, abuse flags, and resolution history stay together.</div>
                </button>
                <button className="detail-card receivables-command-card" onClick={() => onTabChange("Receipts")} type="button">
                  <div className="detail-label">4. Receipts</div>
                  <div className="detail-title">{completedPayments.length} completed</div>
                  <div className="sub">Send or re-send PDF receipts only after transactions are applied to the ledger.</div>
                </button>
              </div>
            </section>

            <section className="section">
              <div className="section-head">
                <h2>Automation status</h2>
                <button className="btn btn-sm" onClick={() => onTabChange("Inbox sync")}>
                  View sync setup
                </button>
              </div>
              <div className="sync-status-panel">
                <div>
                  <div className="detail-label">Gmail / Zelle inbox</div>
                  <div className="detail-title">{inboxSyncCopy}</div>
                  <div className="sub">
                    {gmailSyncAt ? `Last sync: ${new Date(gmailSyncAt).toLocaleString()}.` : "No sync has run yet."}
                    {gmailAutoSyncActive && gmailNextSyncAt
                      ? ` Next automatic sync: ${new Date(gmailNextSyncAt).toLocaleString()}.`
                      : ""}
                  </div>
                </div>
                <span className={`search-status-chip tone-${gmailConfigured && gmailAuthorized ? "success" : "warn"}`}>
                  {gmailAutoSyncLabel}
                </span>
              </div>
            </section>
          </>
        )}

        {currentTab === "Invoices" && (
        <section className="section">
          <div className="section-head">
            <h2>Due to send today</h2>
            <button className="btn btn-sm btn-primary" onClick={onSendAll} disabled={!dueInvoices.length}>
              Send all
            </button>
          </div>
          <div className="section-desc">
            Pulled from the schedule sheet. Review and send, without re-keying anything.
          </div>
          <div className="tcard">
            <div className="trow head due-grid">
              <div>Customer</div>
              <div>Service / due</div>
              <div>Zelle amt</div>
              <div />
            </div>
            {dueInvoices.map((invoice) => (
              <div className="trow due-grid" key={invoice.id}>
                <div>
                  <div className="cust">{invoice.customerName}</div>
                  <div className="sub">
                    Customer ID {invoice.customerCode ?? invoice.customerId} · {invoice.email}
                  </div>
                </div>
                <div>
                  {invoice.service} {invoice.milestone}
                  <div className="sub">
                    due {formatShortDate(invoice.dueDate)}
                    {invoice.referralBonusAmount ? ` · includes ${formatCurrency(invoice.referralBonusAmount)} referral bonus` : ""}
                  </div>
                </div>
                <div className="mono">{formatCurrency(invoice.zelleAmount)}</div>
                <div>
                  <button className="btn btn-sm btn-primary" onClick={() => onPreviewInvoice(invoice.id)}>
                    Send
                  </button>
                </div>
              </div>
            ))}
            {!dueInvoices.length && (
              <div className="empty">
                <IconCheck size={14} />
                All scheduled invoices sent
              </div>
            )}
          </div>
        </section>
        )}

        {currentTab === "Payments to confirm" && (
        <section className="section">
          <div className="section-head">
            <h2>Payments to confirm</h2>
            <button
              className="btn btn-sm btn-primary"
              onClick={onConfirmAll}
              disabled={!pendingPayments.length}
            >
              Apply all high-confidence
            </button>
          </div>
          <div className="section-desc">
            Matched against customer records and saved as durable transaction records. Apply the
            money first, then send or re-send receipts separately from completed transactions.
            {gmailSyncAt ? ` Last inbox sync: ${new Date(gmailSyncAt).toLocaleString()}.` : ""}
            {gmailAutoSyncActive && gmailNextSyncAt
              ? ` Next automatic sync: ${new Date(gmailNextSyncAt).toLocaleString()}.`
              : ""}
          </div>
          <div className="tcard">
            <div className="trow head confirm-grid">
              <div>Customer / invoice</div>
              <div>Saved transaction</div>
              <div>Score</div>
              <div>Paid</div>
              <div />
            </div>
            {pendingPayments.map((payment) => (
              <div className="trow confirm-grid" key={payment.id}>
                <div className="signals">
                  <div className="cust">{payment.customerName}</div>
                  <div className="sub">
                    Customer ID {payment.customerCode ?? payment.customerId} ·{" "}
                    {payment.matchedInvoiceCode ?? "Invoice pending"}
                  </div>
                </div>
                <div>
                  <div className="sub mono">{payment.transactionReference ?? "No transaction ref"}</div>
                  <div className="sub">{payment.memo ?? payment.matchSummary ?? "Saved from synced email"}</div>
                  <div className="sub">{formatPaymentSourceLabel(payment.sourceProvider)}</div>
                  <div className="signals">
                    <span className="ok">
                      <IconCheck size={13} />
                      {payment.matchedSignals.join(" · ")}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="score hi">{payment.score}</span>
                </div>
                <div>
                  <div className="mono">{formatCurrency(payment.amountReceived)}</div>
                  <div className="sub">{formatTransactionDate(payment.transactionDate)}</div>
                </div>
                <div>
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenPayment(payment)}>
                    Review &amp; apply
                  </button>
                </div>
              </div>
            ))}
            {!pendingPayments.length && (
              <div className="empty">
                <IconCheck size={14} />
                No payments waiting
              </div>
            )}
          </div>
        </section>
        )}

        {currentTab === "Receipts" && (
        <section className="section">
          <div className="section-head">
            <h2>Completed transactions</h2>
          </div>
          <div className="section-desc">
            Applied transactions stay in the ledger here. Send or re-send a receipt to the
            customer&apos;s primary email whenever you are ready.
          </div>
          <div className="tcard">
            <div className="trow head completed-grid">
              <div>Customer / invoice</div>
              <div>Transaction</div>
              <div>Applied</div>
              <div>Receipt status</div>
              <div />
            </div>
            {completedPayments.map((payment) => (
              <div className="trow completed-grid" key={payment.id}>
                <div className="signals">
                  <div className="cust">{payment.customerName}</div>
                  <div className="sub">
                    Customer ID {payment.customerCode ?? payment.customerId} ·{" "}
                    {payment.matchedInvoiceCode ?? "Invoice pending"}
                  </div>
                </div>
                <div>
                  <div className="sub mono">{payment.transactionReference ?? "No transaction ref"}</div>
                  <div className="sub">{payment.memo ?? payment.matchSummary ?? "Applied transaction record"}</div>
                  <div className="sub">{formatPaymentSourceLabel(payment.sourceProvider)}</div>
                  <div className="mono">{formatCurrency(payment.amountReceived ?? 0)}</div>
                </div>
                <div>
                  <div className="mono">{formatDateTimeValue(payment.appliedAt)}</div>
                  <div className="sub">
                    {payment.transactionDate
                      ? `Paid ${formatTransactionDate(payment.transactionDate)}`
                      : formatDateTimeValue(payment.receivedAt)}
                  </div>
                </div>
                <div>
                  <span
                    className={`search-status-chip tone-${
                      payment.receiptSentAt ? "success" : emailConfigured ? "warn" : "neutral"
                    }`}
                  >
                    {payment.receiptSentAt ? "Sent" : emailConfigured ? "Ready to send" : "Email setup needed"}
                  </span>
                  <div className="sub">
                    {payment.receiptSentAt
                      ? `${formatDateTimeValue(payment.receiptSentAt)}${
                          payment.receiptSentToEmail ? ` · ${payment.receiptSentToEmail}` : ""
                        }`
                      : "No receipt has been sent yet"}
                  </div>
                </div>
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onSendReceipt(payment.id)}
                    disabled={!emailConfigured || sendingReceiptId === payment.id}
                  >
                    {sendingReceiptId === payment.id
                      ? "Sending…"
                      : payment.receiptSentAt
                        ? "Re-send receipt"
                        : "Send receipt"}
                  </button>
                </div>
              </div>
            ))}
            {!completedPayments.length && (
              <div className="empty">
                <IconCheck size={14} />
                No completed transactions yet
              </div>
            )}
          </div>
        </section>
        )}

        {currentTab === "Exceptions" && (
        <>
        <section className="section">
          <div className="section-head">
            <h2>Exceptions</h2>
          </div>
          <div className="section-desc">
            The system could not safely auto-match these. Approve applies or advances the
            transaction; reject archives it into the preserved review bucket.
          </div>
          <div className="tcard">
            <div className="trow head exception-grid">
              <div>Sender / transaction</div>
              <div>Reason</div>
              <div>Date</div>
              <div />
            </div>
            {exceptions.map((exception) => (
              <div className="trow exception-grid attn" key={exception.id}>
                <div>
                  <div className="cust">{exception.senderName}</div>
                  <div className="sub mono">
                    {formatCurrency(exception.amount)} · {exception.transactionReference ?? "No ref"}
                  </div>
                  <div className="sub">
                    {exception.customerCode
                      ? `Tentative ${exception.customerCode}`
                      : exception.senderEmail || "Customer still unresolved"}
                  </div>
                </div>
                <div>
                  {exception.kind === "mismatch" ? (
                    <span className="pill warn">
                      <IconAlertTriangle size={13} />
                      Amount ≠ exp {formatCurrency(exception.expectedAmount)}
                    </span>
                  ) : (
                    <span className="pill warn">
                      <IconUsers size={13} />
                      {exception.kind === "ambiguous"
                        ? "2 customers match name"
                        : exception.kind === "duplicate"
                          ? exception.summary?.toLowerCase().includes("abuse")
                            ? "Possible abuse / replay risk"
                            : "Possible duplicate payment"
                          : "Needs manual match"}
                    </span>
                  )}
                  <div className="sub exception-summary">{exception.summary}</div>
                </div>
                <div className="sub">
                  {exception.transactionDate
                    ? formatTransactionDate(exception.transactionDate)
                    : exception.dateLabel}
                </div>
                <div className="exception-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      exception.kind === "mismatch"
                        ? onOpenMismatch(exception)
                        : onOpenExceptionReview(exception)
                    }
                  >
                    Review
                  </button>
                  {exception.kind !== "duplicate" ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        exception.kind === "mismatch"
                          ? onOpenMismatch(exception)
                          : onOpenExceptionReview(exception)
                      }
                    >
                      Approve
                    </button>
                  ) : null}
                  <button className="btn btn-sm btn-danger" onClick={() => onOpenExceptionReview(exception)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!exceptions.length && (
              <div className="empty">
                <IconCheck size={14} />
                No exceptions
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Rejected / archived bucket</h2>
          </div>
          <div className="section-desc">
            Rejected records stay here so finance does not lose data. Deleting from this bucket is
            soft-delete only and requires a typed confirmation plus reason.
          </div>
          <div className="tcard">
            <div className="trow head archived-exception-grid">
              <div>Archived</div>
              <div>Sender / transaction</div>
              <div>Reason</div>
              <div>Archived by</div>
              <div />
            </div>
            {archivedExceptions.map((exception) => (
              <div className="trow archived-exception-grid" key={exception.id}>
                <div className="mono">
                  {formatDateTimeValue(exception.archivedAt ?? exception.resolvedAt)}
                </div>
                <div>
                  <div className="cust">{exception.senderName}</div>
                  <div className="sub mono">
                    {formatCurrency(exception.amount ?? 0)} · {exception.transactionReference ?? "No ref"}
                  </div>
                </div>
                <div>
                  <div className="cust">{formatExceptionResolutionAction(exception.resolutionAction)}</div>
                  <div className="sub">{exception.summary}</div>
                </div>
                <div className="sub">{exception.archivedByUsername ?? "Unknown admin"}</div>
                <div className="exception-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => onOpenArchivedDelete(exception)}>
                    <IconTrash size={13} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!archivedExceptions.length && (
              <div className="empty">
                <IconCheck size={14} />
                No rejected or archived exceptions yet
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Exception history</h2>
          </div>
          <div className="section-desc">
            Resolved exceptions stay on record with the action taken, who resolved them, and which
            customer record they were moved against.
          </div>
          <div className="tcard">
            <div className="trow head exception-history-grid">
              <div>Resolved</div>
              <div>Sender / transaction</div>
              <div>Action</div>
              <div>Resolved for</div>
              <div>By</div>
            </div>
            {recentExceptionHistory.map((item) => (
              <div className="trow exception-history-grid" key={item.id}>
                <div className="mono">{formatDateTimeValue(item.resolvedAt)}</div>
                <div>
                  <div className="cust">{item.senderName}</div>
                  <div className="sub mono">
                    {formatCurrency(item.amount ?? 0)} · {item.transactionReference ?? "No ref"}
                  </div>
                </div>
                <div>
                  <div className="cust">{formatExceptionResolutionAction(item.resolutionAction)}</div>
                  <div className="sub">{item.resolutionMessage ?? item.summary}</div>
                </div>
                <div className="sub">
                  {item.resolvedCustomerName
                    ? `${item.resolvedCustomerName} · ${item.resolvedCustomerCode ?? item.resolvedCustomerId}`
                    : "No customer linked"}
                </div>
                <div className="sub">{item.resolvedByUsername ?? "Unknown user"}</div>
              </div>
            ))}
            {!recentExceptionHistory.length && (
              <div className="empty">
                <IconCheck size={14} />
                No resolved exception history yet
              </div>
            )}
          </div>
        </section>
        </>
        )}

        {currentTab === "Inbox sync" && (
          <section className="section">
            <div className="section-head">
              <h2>Inbox sync</h2>
              <button className="btn btn-sm btn-primary" onClick={onSyncInbox} disabled={syncingInbox}>
                <IconRefresh size={14} />
                {syncingInbox ? "Syncing..." : "Sync Zelle inbox"}
              </button>
            </div>
            <div className="section-desc">
              Sync only reads Zelle payment notifications with subject line "You received money
              with Zelle", keeps incremental sync history, and routes every candidate through the
              matching and duplicate-protection layer before review.
            </div>
            <div className="sync-workspace">
              <div className="detail-card sync-workspace-card">
                <div className="detail-label">Connection</div>
                <div className="detail-title">
                  {gmailConfigured
                    ? gmailAuthorized
                      ? "Gmail connected"
                      : "Gmail needs reauthorization"
                    : "Gmail not configured"}
                </div>
                <div className="sub">{inboxSyncCopy}</div>
              </div>
              <div className="detail-card sync-workspace-card">
                <div className="detail-label">Schedule</div>
                <div className="detail-title">{gmailAutoSyncLabel}</div>
                <div className="sub">
                  {gmailAutoSyncActive && gmailNextSyncAt
                    ? `Next run: ${new Date(gmailNextSyncAt).toLocaleString()}`
                    : "Admins can adjust sync cadence in Settings."}
                </div>
              </div>
              <div className="detail-card sync-workspace-card">
                <div className="detail-label">Last sync</div>
                <div className="detail-title">
                  {gmailSyncAt ? new Date(gmailSyncAt).toLocaleString() : "Not run yet"}
                </div>
                <div className="sub">
                  New email candidates land in Payments to confirm or Exceptions depending on match confidence.
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SettingsView({
  username,
  referralProgramForm,
  gmailSyncStatus,
  gmailSyncForm,
  savingReferralProgram,
  savingGmailSync,
  onReferralFormChange,
  onGmailSyncFormChange,
  onSaveReferralProgram,
  onSaveGmailSync,
}) {
  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <div className="sub">
            Manage profile-level access, automation timing, and program rules from one place.
          </div>
        </div>
      </div>
      <div className="content">
        <section className="section">
          <div className="section-head">
            <h2>User profile</h2>
          </div>
          <div className="chart-card admin-form-card">
            <div className="field-row">
              <div className="field">
                <label>Signed-in user</label>
                <div className="admin-rule-preview">{username || "Unknown user"}</div>
              </div>
              <div className="field">
                <label>Portal role</label>
                <div className="admin-rule-preview">Finance administrator</div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Gmail sync automation</h2>
            <button className="btn btn-primary btn-sm" onClick={onSaveGmailSync} disabled={savingGmailSync}>
              {savingGmailSync ? "Saving..." : "Save sync settings"}
            </button>
          </div>
          <div className="section-desc">
            These settings control the automatic Zelle inbox sync. Manual sync remains available in
            the billing console.
          </div>
          <div className="chart-card admin-form-card">
            <div className="admin-rule-preview admin-rule-preview-hero">
              <div className="detail-label">
                {gmailSyncStatus?.autoSync?.active ? "Automatic sync active" : "Automatic sync paused"}
              </div>
              <div className="cust">
                {gmailSyncForm.enabled
                  ? `Runs every ${gmailSyncForm.intervalMinutes || 5} minute${Number(gmailSyncForm.intervalMinutes) === 1 ? "" : "s"}.`
                  : "Scheduled sync is turned off."}
              </div>
              <div className="sub">
                Last sync:{" "}
                {gmailSyncStatus?.lastSyncAt
                  ? new Date(gmailSyncStatus.lastSyncAt).toLocaleString()
                  : "not run yet"}
                {gmailSyncStatus?.autoSync?.nextRunAt
                  ? ` · Next run: ${new Date(gmailSyncStatus.autoSync.nextRunAt).toLocaleString()}`
                  : ""}
              </div>
              {gmailSyncStatus?.autoSync?.lastError && (
                <div className="sub danger-text">{gmailSyncStatus.autoSync.lastError}</div>
              )}
            </div>
            <label className="check-row admin-check-row">
              <input
                type="checkbox"
                checked={gmailSyncForm.enabled}
                onChange={(event) => onGmailSyncFormChange("enabled", event.target.checked)}
              />
              Enable automatic Gmail sync
            </label>
            <div className="field-row">
              <div className="field">
                <label>Sync interval (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  value={gmailSyncForm.intervalMinutes}
                  onChange={(event) => onGmailSyncFormChange("intervalMinutes", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Status</label>
                <div className="admin-rule-preview">
                  {gmailSyncStatus?.configured && gmailSyncStatus?.authorized
                    ? gmailSyncStatus?.autoSync?.active
                      ? "Gmail is authorized and scheduled sync is active."
                      : gmailSyncStatus?.autoSync?.reason || "Gmail is authorized, but scheduled sync is not active."
                    : "Gmail credentials or token are missing."}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Referral rules</h2>
            <button className="btn btn-primary btn-sm" onClick={onSaveReferralProgram} disabled={savingReferralProgram}>
              {savingReferralProgram ? "Saving..." : "Save referral settings"}
            </button>
          </div>
          <div className="section-desc">
            Rule changes only affect new referrals going forward. Each existing relationship keeps
            its recorded rule snapshot.
          </div>
          <div className="chart-card admin-form-card">
            <div className="admin-rule-preview admin-rule-preview-hero">
              <div className="detail-label">{referralProgramForm.programName || "Referral program"}</div>
              <div className="cust">
                {referralProgramForm.enabled
                  ? `${formatCurrency(Number(referralProgramForm.bonusAmount || 0))} bonus after ${formatCurrency(
                      Number(referralProgramForm.qualifyingPaidAmount || 0),
                    )} in paid invoices or ${referralProgramForm.qualificationMonths || 0} months, whichever comes first.`
                  : "Program currently disabled for new referrals."}
              </div>
              <div className="sub">{referralProgramForm.programDescription}</div>
            </div>
            <label className="check-row admin-check-row">
              <input
                type="checkbox"
                checked={referralProgramForm.enabled}
                onChange={(event) => onReferralFormChange("enabled", event.target.checked)}
              />
              Enable referral program for new client enrollments
            </label>
            <div className="field-row">
              <div className="field">
                <label>Program name</label>
                <input
                  value={referralProgramForm.programName}
                  onChange={(event) => onReferralFormChange("programName", event.target.value)}
                  placeholder="Standard referral program"
                />
              </div>
              <div className="field">
                <label>Program note</label>
                <textarea
                  value={referralProgramForm.programDescription}
                  onChange={(event) => onReferralFormChange("programDescription", event.target.value)}
                  rows={3}
                  placeholder="Example: Summer growth campaign or family referral drive"
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Bonus amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={referralProgramForm.bonusAmount}
                  onChange={(event) => onReferralFormChange("bonusAmount", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Qualifying paid amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={referralProgramForm.qualifyingPaidAmount}
                  onChange={(event) => onReferralFormChange("qualifyingPaidAmount", event.target.value)}
                />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Qualification months</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={referralProgramForm.qualificationMonths}
                  onChange={(event) => onReferralFormChange("qualificationMonths", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Rule summary</label>
                <div className="admin-rule-preview">
                  {referralProgramForm.enabled
                    ? `${formatCurrency(Number(referralProgramForm.bonusAmount || 0))} bonus after ${formatCurrency(
                        Number(referralProgramForm.qualifyingPaidAmount || 0),
                      )} paid or ${referralProgramForm.qualificationMonths || 0} months, whichever comes first.`
                    : "Disabled for new referrals."}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminView({
  referralProgram,
  feedbackSubmissions,
  insights,
  referralSubmissions,
  referrals,
  rewards,
  applyingRewardId,
  reviewingFeedbackId,
  reviewingSubmissionId,
  onApplyReward,
  onConvertSubmission,
  onDismissSubmission,
  onUpdateFeedbackStatus,
}) {
  const openReferralSubmissions = referralSubmissions.filter((submission) => submission.status === "submitted");
  const openFeedbackSubmissions = feedbackSubmissions.filter((submission) => submission.status === "new");
  const availableRewards = insights?.qualifiedRewards ?? [];
  const awardedRewards = insights?.appliedRewards ?? [];
  const topReferrers = insights?.topReferrers ?? [];

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Referral Program</h1>
          <div className="sub">
            Define the rules once, track who referred whom, and apply qualified bonuses as discounts
            on the next eligible invoice.
          </div>
        </div>
      </div>
      <div className="content">
        <div className="metrics c5">
          <MetricCard accent label="Program status" value={referralProgram.enabled ? "Active" : "Disabled"} />
          <MetricCard label="Tracked relationships" value={referrals.length} />
          <MetricCard label="Open intake submissions" value={openReferralSubmissions.length} />
          <MetricCard label="Open feedback" value={openFeedbackSubmissions.length} />
          <MetricCard label="Qualified bonuses" value={availableRewards.length} />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>User feedback</h2>
          </div>
          <div className="section-desc">
            This queue is fed by the public no-login form at <span className="mono">/feedback</span>.
            Attachments are accepted as optional context, while engineering follow-up can still be
            tracked later in GitHub Issues when appropriate.
          </div>
          <div className="tcard">
            <div className="trow head feedback-grid">
              <div>Submitted by</div>
              <div>Feedback</div>
              <div>Attachments</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {feedbackSubmissions.map((submission) => {
              const isWorking = reviewingFeedbackId === submission.id;
              const isOpen = submission.status === "new";

              return (
                <div className="trow feedback-grid" key={submission.id}>
                  <div>
                    <div className="cust">{submission.name}</div>
                    <div className="sub">
                      {submission.email}
                      {submission.customerCode ? ` · ${submission.customerCode}` : ""}
                    </div>
                    {submission.phone ? <div className="sub">{submission.phone}</div> : null}
                  </div>
                  <div>
                    <div className="cust">
                      {formatFeedbackCategoryLabel(submission.category)}
                      {submission.rating ? ` · ${submission.rating}/5` : ""}
                    </div>
                    <div className="sub">{submission.message}</div>
                    <div className="sub">Submitted {formatDateTimeValue(submission.submittedAt)}</div>
                  </div>
                  <div className="sub">
                    {submission.attachments.length ? (
                      submission.attachments.map((attachment) => (
                        <div key={attachment.id ?? attachment.fileName}>
                          <a
                            href={`/api/admin/feedback/${encodeURIComponent(
                              submission.id,
                            )}/attachments/${encodeURIComponent(attachment.id)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {attachment.fileName}
                          </a>{" "}
                          · {formatFileSize(attachment.size)}
                        </div>
                      ))
                    ) : (
                      "No attachments"
                    )}
                  </div>
                  <div>
                    <span className={`search-status-chip tone-${formatFeedbackStatusTone(submission.status)}`}>
                      {formatFeedbackStatusLabel(submission.status)}
                    </span>
                    {submission.reviewedAt ? (
                      <div className="sub">
                        {formatDateTimeValue(submission.reviewedAt)} · {submission.reviewedByUsername ?? "admin"}
                      </div>
                    ) : null}
                  </div>
                  <div className="referral-submission-actions">
                    {isOpen ? (
                      <>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => onUpdateFeedbackStatus(submission.id, "review")}
                          disabled={isWorking}
                        >
                          {isWorking ? "Working…" : "Mark reviewed"}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => onUpdateFeedbackStatus(submission.id, "archive")}
                          disabled={isWorking}
                        >
                          Archive
                        </button>
                      </>
                    ) : (
                      <span className="sub">Closed</span>
                    )}
                  </div>
                </div>
              );
            })}
            {!feedbackSubmissions.length && (
              <div className="empty">No user feedback has been submitted yet.</div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Customer referral submissions</h2>
          </div>
          <div className="section-desc">
            This queue is fed by the public no-login form at <span className="mono">/refer</span>.
            Duplicate entries are blocked by referred email or phone before they reach finance.
          </div>
          <div className="tcard">
            <div className="trow head referral-submission-grid">
              <div>Referrer</div>
              <div>Referred person</div>
              <div>Relationship + submitted</div>
              <div>Customer match</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {referralSubmissions.map((submission) => {
              const canConvert = submission.status === "submitted" && submission.matchedCustomerId;
              const isReviewing = reviewingSubmissionId === submission.id;

              return (
                <div className="trow referral-submission-grid" key={submission.id}>
                  <div>
                    <div className="cust">{submission.referrerCustomerName}</div>
                    <div className="sub">
                      {submission.referrerCustomerCode} · {submission.referrerEmail}
                    </div>
                  </div>
                  <div>
                    <div className="cust">{submission.referredFullName}</div>
                    <div className="sub">
                      {submission.referredEmail}
                      {submission.referredPhone ? ` · ${submission.referredPhone}` : ""}
                    </div>
                  </div>
                  <div className="sub">
                    {formatReferralRelationshipLabel(submission.relationshipLabel)}
                    <div>{submission.submittedAt ? formatLongDate(submission.submittedAt) : "Date not captured"}</div>
                  </div>
                  <div className="sub">
                    {submission.matchedCustomerId ? (
                      <>
                        <div className="cust">{submission.matchedCustomerName}</div>
                        <div>{submission.matchedCustomerCode}</div>
                      </>
                    ) : (
                      "Not in customer DB yet"
                    )}
                  </div>
                  <div>
                    <span className={`search-status-chip tone-${formatReferralSubmissionStatusTone(submission.status)}`}>
                      {formatReferralSubmissionStatusLabel(submission.status)}
                    </span>
                    {submission.convertedAt ? (
                      <div className="sub">Converted {formatDateTimeValue(submission.convertedAt)}</div>
                    ) : null}
                    {submission.dismissedAt ? (
                      <div className="sub">Dismissed {formatDateTimeValue(submission.dismissedAt)}</div>
                    ) : null}
                  </div>
                  <div className="referral-submission-actions">
                    {canConvert ? (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => onConvertSubmission(submission.id)}
                        disabled={isReviewing}
                      >
                        {isReviewing ? "Converting…" : "Convert"}
                      </button>
                    ) : (
                      <span className="sub">
                        {submission.status === "submitted"
                          ? "Wait for onboarding"
                          : submission.status === "converted"
                            ? "Tracked in program"
                            : "Closed"}
                      </span>
                    )}
                    {submission.status === "submitted" ? (
                      <button
                        className="btn btn-sm"
                        onClick={() => onDismissSubmission(submission.id)}
                        disabled={isReviewing}
                      >
                        {isReviewing ? "Working…" : "Dismiss"}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!referralSubmissions.length && (
              <div className="empty">No public referral submissions have been recorded yet.</div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Referral relationships</h2>
          </div>
          <div className="section-desc">
            Every relationship keeps the referrer, the referred customer, the relationship type, the
            referral date, and the rule active at the time it was recorded.
          </div>
          <div className="tcard">
            <div className="trow head admin-grid">
              <div>Referrer</div>
              <div>Referred client</div>
              <div>Relationship + date</div>
              <div>Rule snapshot</div>
              <div>Status</div>
            </div>
            {referrals.map((referral) => (
              <div className="trow admin-grid" key={referral.id}>
                <div>
                  <div className="cust">{referral.referrerCustomerName}</div>
                  <div className="sub">{referral.referrerCustomerCode}</div>
                </div>
                <div>
                  <div className="cust">{referral.referredCustomerName}</div>
                  <div className="sub">{referral.referredCustomerCode}</div>
                </div>
                <div className="sub">
                  {formatReferralRelationshipLabel(referral.relationshipLabel)}
                  <div>{referral.referredOn ? formatLongDate(referral.referredOn) : "Date not captured"}</div>
                </div>
                <div className="sub">
                  {formatCurrency(referral.bonusAmount)} bonus · {formatCurrency(referral.qualifyingPaidAmount)} paid
                  or {referral.qualifyingMonths} months
                  {referral.notes ? <div>{referral.notes}</div> : null}
                </div>
                <div>
                  <span className={`search-status-chip tone-${formatReferralStatusTone(referral.status)}`}>
                    {formatReferralStatusLabel(referral.status)}
                  </span>
                  {referral.qualifiedAt ? <div className="sub">Qualified {formatDateTimeValue(referral.qualifiedAt)}</div> : null}
                  {referral.awardedAt ? <div className="sub">Applied {formatDateTimeValue(referral.awardedAt)}</div> : null}
                </div>
              </div>
            ))}
            {!referrals.length && <div className="empty">No referral relationships recorded yet.</div>}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Qualified for bonus</h2>
          </div>
          <div className="section-desc">
            Green rows are ready. Applying a bonus reduces the next eligible draft invoice for that
            customer. No direct cash credits are created.
          </div>
          <div className="tcard">
            <div className="trow head reward-apply-grid">
              <div>Referrer</div>
              <div>Next eligible invoice</div>
              <div>Bonus</div>
              <div>Qualified</div>
              <div>Action</div>
            </div>
            {availableRewards.map((reward) => (
              <div className="trow reward-apply-grid referral-qualified-row" key={reward.id}>
                <div>
                  <div className="cust">{reward.customerName}</div>
                  <div className="sub">{reward.customerCode}</div>
                </div>
                <div>
                  {reward.nextInvoice ? (
                    <>
                      <div className="cust">{reward.nextInvoice.invoiceCode}</div>
                      <div className="sub">
                        {reward.nextInvoice.service} · due {formatShortDate(reward.nextInvoice.dueDate)}
                      </div>
                    </>
                  ) : (
                    <div className="sub">No draft invoice available yet</div>
                  )}
                </div>
                <div className="mono">{formatCurrency(reward.amount)}</div>
                <div className="sub">{formatDateTimeValue(reward.earnedAt)}</div>
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onApplyReward(reward.id)}
                    disabled={!reward.nextInvoice || applyingRewardId === reward.id}
                  >
                    {applyingRewardId === reward.id ? "Applying…" : "Apply referral bonus"}
                  </button>
                </div>
              </div>
            ))}
            {!availableRewards.length && (
              <div className="empty">
                No referrer has qualified for a bonus yet.
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Reporting</h2>
          </div>
          <div className="section-desc">
            Simple reporting that shows how the program is performing, who is driving referrals, and
            how much bonus has already been spent through invoice discounts.
          </div>
          <div className="metrics c4">
            <MetricCard accent label="Relationships tracked" value={referrals.length} />
            <MetricCard label="Still qualifying" value={insights?.activeReferrals?.length ?? 0} />
            <MetricCard label="Qualified value" value={formatCurrency(insights?.totalBonusAvailable ?? 0)} />
            <MetricCard label="Bonus spent" value={formatCurrency(insights?.totalBonusSpent ?? 0)} />
          </div>
          <div className="two-col">
            <div className="tcard">
              <div className="trow head referral-report-grid">
                <div>Top referrer</div>
                <div>Relationships</div>
                <div>Qualified</div>
                <div>Bonus spent</div>
              </div>
              {topReferrers.length ? (
                topReferrers.map((referrer) => (
                  <div className="trow referral-report-grid" key={referrer.referrerCustomerId}>
                    <div>
                      <div className="cust">{referrer.referrerCustomerName}</div>
                      <div className="sub">{referrer.referrerCustomerCode}</div>
                    </div>
                    <div className="mono">{referrer.totalReferrals}</div>
                    <div className="mono">{referrer.qualifiedCount}</div>
                    <div className="mono">{formatCurrency(referrer.totalBonusSpent)}</div>
                  </div>
                ))
              ) : (
                <div className="empty">No referrer reporting rows yet.</div>
              )}
            </div>

            <div className="tcard">
              <div className="trow head reward-grid">
                <div>Applied bonus</div>
                <div>Invoice</div>
                <div>Applied on</div>
                <div>Applied by</div>
              </div>
              {awardedRewards.length ? (
                awardedRewards.map((reward) => (
                  <div className="trow reward-grid" key={reward.id}>
                    <div>
                      <div className="cust">{reward.customerName}</div>
                      <div className="sub">{formatCurrency(reward.amount)}</div>
                    </div>
                    <div className="mono">{reward.appliedInvoiceCode ?? "Not linked"}</div>
                    <div className="sub">{formatDateTimeValue(reward.appliedAt)}</div>
                    <div className="sub">{reward.appliedByUsername ?? "Not captured"}</div>
                  </div>
                ))
              ) : (
                <div className="empty">No referral bonuses have been applied to invoices yet.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchView({
  customers,
  dueInvoices,
  invoices,
  pendingPayments,
  exceptions,
  query,
  results,
  onQueryChange,
  onOpenCustomer,
}) {
  const showingAll = !query.trim();
  const hint = showingAll
    ? "Showing the full customer register. Search across ID, name, email, phone, alias, and invoice references."
    : `${results.length} match${results.length === 1 ? "" : "es"} for "${query.trim().toLowerCase()}"`;
  const sheetRows = results.map((customer) => ({
    customer,
    status: buildCustomerLedgerStatus(customer, {
      dueInvoices,
      invoices,
      pendingPayments,
      exceptions,
    }),
    primaryEmail: getPrimaryCustomerEmail(customer),
    primaryPhone: getPrimaryCustomerPhone(customer),
    serviceSummary: summarizeCustomerServices(customer),
    invoiceSummary: summarizeInvoiceReferences(customer),
    matchLine: buildMatchLine(customer, query),
  }));

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Customer search</h1>
          <div className="sub">
            Spreadsheet-style lookup for finance operations. Search by customer ID, name, any
            email, any phone, alias, or invoice code.
          </div>
        </div>
      </div>
      <div className="content search-content">
        <div className="chart-card search-toolbar-card">
          <div className="search-toolbar-head">
            <div>
              <div className="search-toolbar-title">Customer register</div>
              <div className="search-toolbar-copy">{hint}</div>
            </div>
            <div className="search-toolbar-count">
              {results.length} row{results.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="search-wrap search-register-input">
            <IconSearch size={18} />
            <input
              className="search-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Try: 100004, 4471, sharma, or an email…"
            />
          </div>
          <div className="search-status-legend">
            <span className="search-status-chip tone-success">Active</span>
            <span className="search-status-chip tone-success">Payment ready</span>
            <span className="search-status-chip tone-ink">Awaiting payment</span>
            <span className="search-status-chip tone-neutral">Draft queued</span>
            <span className="search-status-chip tone-warn">Needs follow-up</span>
            <span className="search-status-chip tone-danger">Needs review</span>
          </div>
        </div>

        <div className="tcard search-sheet-wrap">
          <div className="trow head search-sheet-grid search-sheet-head">
            <div>Customer</div>
            <div>Status</div>
            <div>Primary email</div>
            <div>Primary phone</div>
            <div>Services</div>
            <div>{showingAll ? "Invoice context" : "Search match"}</div>
            <div />
          </div>

          {!sheetRows.length && <div className="empty">No customers match that search</div>}

          {sheetRows.map(({ customer, status, primaryEmail, primaryPhone, serviceSummary, invoiceSummary, matchLine }) => (
            <div className="trow search-sheet-grid search-sheet-row" key={customer.id}>
              <div className="search-cell">
                <button className="search-name-button" onClick={() => onOpenCustomer(customer)} type="button">
                  {customer.name}
                </button>
                <div className="sub search-cell-sub">
                  Customer ID {formatCustomerReference(customer)} · {formatOnboardingStatus(customer.profile?.onboardingStatus)}
                </div>
              </div>

              <div className="search-cell">
                <span className={`search-status-chip tone-${status.tone}`}>{status.label}</span>
                <div className="sub search-cell-sub">{status.detail}</div>
              </div>

              <div className="search-cell">
                <div>{primaryEmail}</div>
                <div className="sub search-cell-sub">
                  {customer.emails.length} email{customer.emails.length === 1 ? "" : "s"} on file
                </div>
              </div>

              <div className="search-cell">
                <div>{primaryPhone}</div>
                <div className="sub search-cell-sub">
                  {customer.phones.length} phone{customer.phones.length === 1 ? "" : "s"} on file
                </div>
              </div>

              <div className="search-cell">
                <div>{serviceSummary.primary}</div>
                <div className="sub search-cell-sub">{serviceSummary.detail}</div>
              </div>

              <div className="search-cell">
                {showingAll ? (
                  <>
                    <div className="mono">{invoiceSummary.primary}</div>
                    <div className="sub search-cell-sub">{invoiceSummary.detail}</div>
                  </>
                ) : (
                  <>
                    <div
                      className="sub search-match-copy"
                      dangerouslySetInnerHTML={{ __html: matchLine }}
                    />
                    <div className="sub search-cell-sub">
                      {formatFeeType(customer.profile?.feeType)} ·{" "}
                      {formatPaymentMethod(customer.profile?.preferredPaymentMethod)} ·{" "}
                      {formatBillingCadence(customer.profile?.billingCadence)}
                    </div>
                  </>
                )}
              </div>

              <div className="search-cell search-open-cell">
                <button className="btn btn-sm" onClick={() => onOpenCustomer(customer)}>
                  360 view
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ accent = false, label, value, delta, deltaIcon, deltaTone }) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta ? (
        <div className={`delta ${deltaTone ?? ""}`}>
          {deltaIcon}
          {delta}
        </div>
      ) : null}
    </div>
  );
}

function ModalShell({ children, onClose, show, size = "default" }) {
  if (!show) {
    return null;
  }

  return (
    <div className="modal-back show" onClick={onClose}>
      <div className={`modal ${size === "wide" ? "wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function NewInvoiceModal({
  customers,
  customerQuery,
  customerResults,
  form,
  onClose,
  onCreateInvoice,
  onCustomerQueryChange,
  onFormChange,
  onOpenOnboarding,
  onSelectCustomer,
  selectedCustomer,
  invoiceCode,
  serviceOptions,
  zelleAmount,
}) {
  const customerSearchId = useId();

  return (
    <>
      <div className="modal-head">
        <div>
          <h3>New invoice</h3>
          <div className="sub modal-sub">
            Manual backup. Most invoices should still generate from the schedule automatically.
          </div>
        </div>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        {form.selectedCustomerId !== "new" ? (
          <div className="field">
            <label htmlFor={customerSearchId}>Customer</label>
            <div className="search-wrap modal-search">
              <IconSearch size={18} />
              <input
                id={customerSearchId}
                className="search-input"
                value={customerQuery}
                onChange={(event) => onCustomerQueryChange(event.target.value)}
                placeholder="Search by phone, email, first name, or last name"
              />
            </div>
            {!customerQuery.trim() && !selectedCustomer ? (
              <div className="autofill-note">
                Search across phone, email, first name, and last name to find an existing member.
              </div>
            ) : null}
            {selectedCustomer ? (
              <div className="picker-selected">
                <div>
                  <div className="cust">{selectedCustomer.name}</div>
                  <div className="sub">
                    Customer ID {formatCustomerReference(selectedCustomer)} · Autofilled from record ·{" "}
                    {summarizeContacts(selectedCustomer)} ·{" "}
                    {selectedCustomer.services.length} predefined service
                    {selectedCustomer.services.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button className="btn btn-sm" type="button" onClick={() => onSelectCustomer("")}>
                  Clear
                </button>
              </div>
            ) : null}
            {customerQuery.trim() && !selectedCustomer ? (
              <div className="picker-results">
                {customerResults.length ? (
                  customerResults.map((customer) => (
                    <button
                      className="picker-item"
                      key={customer.id}
                      type="button"
                      onClick={() => onSelectCustomer(customer.id)}
                    >
                      <div>
                        <div className="cust">{customer.name}</div>
                        <div className="sub">
                          Customer ID {formatCustomerReference(customer)} · {describeCustomerMatch(customer)} ·{" "}
                          {summarizeContacts(customer)}
                        </div>
                      </div>
                      <div className="picker-service-count">
                        {customer.services.length} service
                        {customer.services.length === 1 ? "" : "s"}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="picker-empty">
                    No existing customer matches that search.
                  </div>
                )}
              </div>
            ) : null}
            <button className="btn btn-sm" type="button" onClick={() => onSelectCustomer("new")}>
              New customer instead
            </button>
            <div className="autofill-note">
              Best practice: use Client onboarding first so payment preferences and Zelle match details
              are captured before the first invoice.
            </div>
          </div>
        ) : (
          <div className="field">
            <label>Customer</label>
            <div className="picker-selected">
              <div>
                <div className="cust">New customer</div>
                <div className="sub">
                  Enter the member details below, or switch back to search an existing member.
                </div>
              </div>
              <button className="btn btn-sm" type="button" onClick={() => onSelectCustomer("")}>
                Search existing
              </button>
            </div>
            <button className="btn btn-sm" type="button" onClick={onOpenOnboarding}>
              Open onboarding flow
            </button>
          </div>
        )}

        {selectedCustomer ? (
          <div className="field-row">
            <div className="field">
              <label>Send to email</label>
              <select
                value={form.selectedEmail}
                onChange={(event) => onFormChange("selectedEmail", event.target.value)}
              >
                {selectedCustomer.emails.map((email) => (
                  <option key={email.value} value={email.value}>
                    {email.value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Phone on file</label>
              <input value={selectedCustomer.phones[0]?.value ?? "No phone on file"} disabled />
            </div>
          </div>
        ) : null}

        {form.selectedCustomerId === "new" ? (
          <div className="field-row">
            <div className="field">
              <label>Customer name</label>
              <input
                value={form.customerName}
                onChange={(event) => onFormChange("customerName", event.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                value={form.customerEmail}
                onChange={(event) => onFormChange("customerEmail", event.target.value)}
                placeholder="name@email.com"
              />
            </div>
          </div>
        ) : null}

        {form.selectedCustomerId === "new" ? (
          <div className="field">
            <label>Phone</label>
            <input
              value={form.customerPhone}
              onChange={(event) => onFormChange("customerPhone", event.target.value)}
              placeholder="(555) 555-5555"
            />
          </div>
        ) : null}

        <div className="field-row">
          <div className="field">
            <label>Service</label>
            <select value={form.service} onChange={(event) => onFormChange("service", event.target.value)}>
              {serviceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {selectedCustomer ? (
              <div className="autofill-note">
                Predefined services on file for this member.
              </div>
            ) : null}
          </div>
          <div className="field">
            <label>Milestone / note</label>
            <input
              value={form.milestone}
              onChange={(event) => onFormChange("milestone", event.target.value)}
              placeholder="e.g. M2"
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Base amount ($)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(event) => onFormChange("amount", Number(event.target.value))}
            />
          </div>
          <div className="field">
            <label>Zelle discount (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={form.discountPct}
              onChange={(event) => onFormChange("discountPct", Number(event.target.value))}
            />
            <div className="autofill-note">Default 5% · override per invoice</div>
          </div>
        </div>

        <div className="field">
          <label>Due date</label>
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => onFormChange("dueDate", event.target.value)}
          />
        </div>

        <div className="pricing-preview">
          <div className="kv">
            <span className="k">Zelle price ({form.discountPct}% off)</span>
            <span className="price-accent">{formatCurrency(zelleAmount)}</span>
          </div>
          <div className="kv">
            <span className="k">Card price (full)</span>
            <span className="mono">{formatCurrency(Number(form.amount || 0))}</span>
          </div>
          <div className="kv">
            <span className="k">Invoice ref</span>
            <span className="mono">{invoiceCode}</span>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={() => onCreateInvoice({ sendNow: true })}>
          Create &amp; send
        </button>
        <button className="btn" onClick={() => onCreateInvoice({ sendNow: false })}>
          Save as draft
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function buildServiceOptions(customer) {
  if (!customer?.services?.length) {
    return DEFAULT_SERVICE_OPTIONS;
  }

  const options = Array.from(new Set(customer.services.map((service) => normalizeServiceLabel(service))));
  if (!options.includes("Custom")) {
    options.push("Custom");
  }

  return options;
}

function describeCustomerMatch(customer) {
  if (!customer.matchField) {
    return "Existing customer";
  }

  const labels = {
    name: `Matched name ${customer.matchValue}`,
    customerId: `Matched customer ID ${customer.matchValue}`,
    email: `Matched email ${customer.matchValue}`,
    phone: `Matched phone ${customer.matchValue}`,
    alias: `Matched alias ${customer.matchValue}`,
    invoice: `Matched invoice ${customer.matchValue}`,
  };

  return labels[customer.matchField] ?? "Existing customer";
}

function formatOnboardingStatus(value) {
  const labels = {
    complete: "Intake complete",
    needs_follow_up: "Needs follow-up",
  };

  return labels[value] ?? "Profile pending";
}

function formatPaymentMethod(value) {
  const labels = {
    zelle: "Zelle first",
    card: "Card first",
    both: "Both supported",
  };

  return labels[value] ?? "Payment method pending";
}

function formatFeeType(value) {
  const labels = {
    one_time: "One-time fee",
    recurring: "Recurring fee",
  };

  return labels[value] ?? "Fee type pending";
}

function formatBillingCadence(value) {
  const labels = {
    per_milestone: "Per milestone",
    monthly: "Monthly cycle",
    custom: "Custom cadence",
  };

  return labels[value] ?? "Cadence pending";
}

function getComparableTime(...values) {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return 0;
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatReferralRelationshipLabel(value) {
  const normalized = String(value || "").trim();
  return normalized ? titleCaseWords(normalized) : "Relationship not captured";
}

function formatInvoiceStatusLabel(value) {
  const labels = {
    draft: "Draft",
    sent: "Sent",
    overdue: "Overdue",
    paid: "Paid",
  };

  return labels[value] ?? value ?? "Unknown";
}

function formatInvoiceStatusTone(value) {
  const tones = {
    draft: "neutral",
    sent: "ink",
    overdue: "danger",
    paid: "success",
  };

  return tones[value] ?? "neutral";
}

function formatRewardStatusTone(value) {
  const tones = {
    available: "success",
    applied: "success",
    active: "ink",
    awarded: "success",
  };

  return tones[value] ?? "neutral";
}

function formatReferralStatusLabel(value) {
  const labels = {
    active: "Tracking",
    qualified: "Qualified",
    awarded: "Bonus applied",
    disabled: "Disabled",
  };

  return labels[value] ?? "Unknown";
}

function formatReferralStatusTone(value) {
  const tones = {
    active: "ink",
    qualified: "success",
    awarded: "neutral",
    disabled: "neutral",
  };

  return tones[value] ?? "neutral";
}

function formatReferralSubmissionStatusLabel(value) {
  const labels = {
    submitted: "Needs review",
    converted: "Converted",
    dismissed: "Dismissed",
  };

  return labels[value] ?? "Unknown";
}

function formatReferralSubmissionStatusTone(value) {
  const tones = {
    submitted: "warn",
    converted: "success",
    dismissed: "neutral",
  };

  return tones[value] ?? "neutral";
}

function formatFeedbackCategoryLabel(value) {
  return FEEDBACK_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? "General feedback";
}

function formatFeedbackStatusLabel(value) {
  const labels = {
    new: "Needs review",
    reviewed: "Reviewed",
    archived: "Archived",
  };

  return labels[value] ?? "Unknown";
}

function formatFeedbackStatusTone(value) {
  const tones = {
    new: "warn",
    reviewed: "success",
    archived: "neutral",
  };

  return tones[value] ?? "neutral";
}

function getNextEligibleDraftInvoice(invoices, customerId) {
  return [...(invoices ?? [])]
    .filter((invoice) => invoice.customerId === customerId && invoice.status === "draft")
    .sort(
      (left, right) =>
        getComparableTime(left.dueDate, left.createdAt) - getComparableTime(right.dueDate, right.createdAt),
    )[0] ?? null;
}

function buildReferralProgramInsights({ referrals = [], rewards = [], invoices = [] }) {
  const referralRewards = rewards.filter((reward) => reward.rewardType === "referral_bonus");
  const qualifiedRewards = referralRewards
    .filter((reward) => reward.status === "available")
    .map((reward) => ({
      ...reward,
      nextInvoice: getNextEligibleDraftInvoice(invoices, reward.customerId),
    }))
    .sort(
      (left, right) =>
        getComparableTime(right.earnedAt, right.createdAt) - getComparableTime(left.earnedAt, left.createdAt),
    );
  const appliedRewards = referralRewards
    .filter((reward) => reward.status === "applied")
    .sort(
      (left, right) =>
        getComparableTime(right.appliedAt, right.earnedAt) - getComparableTime(left.appliedAt, left.earnedAt),
    );

  const topReferrerMap = new Map();
  for (const referral of referrals) {
    const current =
      topReferrerMap.get(referral.referrerCustomerId) ?? {
        referrerCustomerId: referral.referrerCustomerId,
        referrerCustomerName: referral.referrerCustomerName,
        referrerCustomerCode: referral.referrerCustomerCode,
        totalReferrals: 0,
        qualifiedCount: 0,
        appliedCount: 0,
        totalBonusSpent: 0,
      };
    current.totalReferrals += 1;
    if (referral.status === "qualified" || referral.status === "awarded") {
      current.qualifiedCount += 1;
    }
    if (referral.status === "awarded") {
      current.appliedCount += 1;
    }
    current.totalBonusSpent = roundDisplayCurrency(
      current.totalBonusSpent +
        appliedRewards
          .filter((reward) => reward.referralId === referral.id)
          .reduce((sum, reward) => sum + Number(reward.amount || 0), 0),
    );
    topReferrerMap.set(referral.referrerCustomerId, current);
  }

  return {
    qualifiedRewards,
    appliedRewards,
    activeReferrals: referrals.filter((referral) => referral.status === "active"),
    qualifiedReferrals: referrals.filter((referral) => referral.status === "qualified"),
    awardedReferrals: referrals.filter((referral) => referral.status === "awarded"),
    totalBonusAvailable: roundDisplayCurrency(
      qualifiedRewards.reduce((sum, reward) => sum + Number(reward.amount || 0), 0),
    ),
    totalBonusSpent: roundDisplayCurrency(
      appliedRewards.reduce((sum, reward) => sum + Number(reward.amount || 0), 0),
    ),
    topReferrers: [...topReferrerMap.values()].sort((left, right) => {
      if (right.totalBonusSpent !== left.totalBonusSpent) {
        return right.totalBonusSpent - left.totalBonusSpent;
      }
      return right.totalReferrals - left.totalReferrals;
    }),
  };
}

function roundDisplayCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function Customer360Page({
  customer,
  customers,
  invoices,
  payments,
  pendingPayments,
  exceptions,
  exceptionHistory,
  referrals,
  rewards,
  onBack,
}) {
  if (!customer) {
    return null;
  }

  const status = buildCustomerLedgerStatus(customer, {
    dueInvoices: invoices.filter((invoice) => invoice.status === "draft"),
    invoices,
    pendingPayments,
    exceptions,
  });
  const customerInvoices = [...invoices]
    .filter((invoice) => invoice.customerId === customer.id)
    .sort(
      (left, right) =>
        getComparableTime(right.dueDate, right.updatedAt, right.createdAt) -
        getComparableTime(left.dueDate, left.updatedAt, left.createdAt),
    );
  const customerPayments = [...payments]
    .filter((payment) => payment.customerId === customer.id)
    .sort(
      (left, right) =>
        getComparableTime(right.appliedAt, right.transactionDate, right.receivedAt) -
        getComparableTime(left.appliedAt, left.transactionDate, left.receivedAt),
    );
  const customerExceptions = exceptions.filter(
    (exception) =>
      exception.customerId === customer.id ||
      exception.candidates?.some((candidate) => candidate.customerId === customer.id),
  );
  const customerExceptionHistory = (exceptionHistory ?? []).filter(
    (item) => item.resolvedCustomerId === customer.id,
  );
  const referralSourceRecord =
    referrals.find((referral) => referral.referredCustomerId === customer.id) ?? null;
  const referrerCustomer =
    customers.find((item) => item.id === customer.profile?.referredByCustomerId) ??
    customers.find((item) => item.id === referralSourceRecord?.referrerCustomerId) ??
    null;
  const referralsMade = referrals.filter((referral) => referral.referrerCustomerId === customer.id);
  const relatedRewards = rewards.filter(
    (reward) =>
      reward.customerId === customer.id ||
      reward.referrerCustomerId === customer.id ||
      reward.referredCustomerId === customer.id,
  );
  const pendingPaymentIds = new Set(pendingPayments.map((payment) => payment.id));
  const address = formatCustomerAddress(customer);
  const serviceHistory = [...(customer.serviceHistory ?? [])].sort(
    (left, right) => getComparableTime(right.enrolledAt) - getComparableTime(left.enrolledAt),
  );
  const contractRecords = [...(customer.contracts ?? [])].sort(
    (left, right) => getComparableTime(right.uploadedAt) - getComparableTime(left.uploadedAt),
  );
  const activeContract =
    customer.activeContract ??
    selectPreferredContractUpload(contractRecords, { requireBilling: true }) ??
    selectPreferredContractUpload(contractRecords, { requireProfile: true }) ??
    contractRecords[0] ??
    null;
  const financeSnapshot = {
    openInvoices: customerInvoices.filter((invoice) => invoice.status === "sent" || invoice.status === "overdue")
      .length,
    savedTransactions: customerPayments.length,
    openReviews: customerExceptions.length,
    referralsMade: referralsMade.length,
    availableBonus: relatedRewards
      .filter((reward) => reward.status === "available")
      .reduce((sum, reward) => sum + Number(reward.amount || 0), 0),
    spentBonus: relatedRewards
      .filter((reward) => reward.status === "applied")
      .reduce((sum, reward) => sum + Number(reward.amount || 0), 0),
  };
  const contractNote = customer.profile?.billingNotes?.trim();

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Customer 360</h1>
          <div className="sub">
            Full record view for onboarding, billing, payment history, referrals, and working
            contract context.
          </div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-sm" onClick={onBack}>
            Back to customer search
          </button>
        </div>
      </div>
      <div className="content customer360-layout customer360-page-layout">
        <div className="customer360-hero">
          <div>
            <div className="detail-label">Customer snapshot</div>
            <div className="customer360-title">{customer.name}</div>
            <div className="sub">
              Customer ID {formatCustomerReference(customer)} · signed up{" "}
              {customer.profile?.onboardedAt ? formatDateTimeValue(customer.profile.onboardedAt) : "date not captured"}
            </div>
          </div>
          <div className="customer360-chip-row">
            <span className={`search-status-chip tone-${status.tone}`}>{status.label}</span>
            <span className="search-status-chip tone-neutral">{formatOnboardingStatus(customer.profile?.onboardingStatus)}</span>
            <span className="search-status-chip tone-ink">{formatPaymentMethod(customer.profile?.preferredPaymentMethod)}</span>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <div className="detail-label">Identity and contacts</div>
            <div className="detail-kv"><span>Primary email</span><strong>{getPrimaryCustomerEmail(customer)}</strong></div>
            <div className="detail-kv"><span>Primary phone</span><strong>{getPrimaryCustomerPhone(customer)}</strong></div>
            <div className="detail-kv"><span>All emails</span><strong>{customer.emails.map((item) => item.value).join(" · ") || "Not captured"}</strong></div>
            <div className="detail-kv"><span>All phones</span><strong>{customer.phones.map((item) => item.value).join(" · ") || "Not captured"}</strong></div>
            <div className="detail-kv"><span>Zelle aliases</span><strong>{customer.aliases.length ? customer.aliases.map((alias) => alias.email || alias.name || alias.phoneLast4).join(" · ") : "None saved"}</strong></div>
          </div>

          <div className="detail-card">
            <div className="detail-label">Address and signup</div>
            <div className="detail-kv"><span>Signed up</span><strong>{customer.profile?.onboardedAt ? formatDateTimeValue(customer.profile.onboardedAt) : "Not captured"}</strong></div>
            <div className="detail-kv"><span>Referral source</span><strong>{customer.profile?.referralSource || "Direct / not captured"}</strong></div>
            <div className="detail-kv"><span>Home address</span><strong className="customer360-prewrap">{address}</strong></div>
          </div>

          <div className="detail-card">
            <div className="detail-label">Contract and billing setup</div>
            <div className="detail-kv"><span>Fee type</span><strong>{formatFeeType(customer.profile?.feeType)}</strong></div>
            <div className="detail-kv"><span>Billing cadence</span><strong>{formatBillingCadence(customer.profile?.billingCadence)}</strong></div>
            <div className="detail-kv"><span>Preferred payment</span><strong>{formatPaymentMethod(customer.profile?.preferredPaymentMethod)}</strong></div>
            <div className="detail-kv"><span>Service start</span><strong>{customer.profile?.serviceStartDate ? formatLongDate(customer.profile.serviceStartDate) : activeContract?.serviceStartDate ? formatLongDate(activeContract.serviceStartDate) : "Not captured"}</strong></div>
            <div className="detail-kv"><span>Enrolled services</span><strong>{customer.services.length ? summarizeServiceLabels(customer.services, 8).all.join(" · ") : "Not captured"}</strong></div>
            <div className="detail-kv"><span>Active contract</span><strong>{activeContract ? activeContract.fileName : "No contract uploaded yet"}</strong></div>
            <div className="detail-kv"><span>Contract type</span><strong>{activeContract?.contractKindLabel || "Not captured"}</strong></div>
            <div className="detail-kv"><span>Contract fee</span><strong>{activeContract?.totalFee ? formatCurrency(activeContract.totalFee) : "Not captured"}</strong></div>
            <div className="detail-kv"><span>Installments</span><strong>{activeContract ? `${activeContract.installmentCount} planned` : "Not captured"}</strong></div>
            {activeContract ? (
              <div className="contract-badge-row">
                <span className="contract-kind-badge">{activeContract.contractKindLabel || "Supporting document"}</span>
                <span className="contract-kind-note">{getContractUsageLabel(activeContract)}</span>
              </div>
            ) : null}
            {activeContract ? (
              <a className="btn btn-sm" href={activeContract.downloadPath} rel="noreferrer" target="_blank">
                Open uploaded contract
              </a>
            ) : null}
            {contractNote ? <div className="detail-note">{contractNote}</div> : <div className="detail-note">No separate contract note is stored yet. Uploading a contract on onboarding keeps the billing setup, fees, and installments together with the client record.</div>}
          </div>

          <div className="detail-card">
            <div className="detail-label">Referral and finance snapshot</div>
            <div className="detail-kv"><span>Referred by</span><strong>{referrerCustomer ? `${referrerCustomer.name} · ${formatCustomerReference(referrerCustomer)}` : "Not referred by another client"}</strong></div>
            <div className="detail-kv"><span>Referrals made</span><strong>{String(financeSnapshot.referralsMade)}</strong></div>
            <div className="detail-kv"><span>Qualified bonus value</span><strong>{formatCurrency(financeSnapshot.availableBonus)}</strong></div>
            <div className="detail-kv"><span>Bonus spent</span><strong>{formatCurrency(financeSnapshot.spentBonus)}</strong></div>
            <div className="detail-kv"><span>Open invoices</span><strong>{String(financeSnapshot.openInvoices)}</strong></div>
            <div className="detail-kv"><span>Saved transactions</span><strong>{String(financeSnapshot.savedTransactions)}</strong></div>
            <div className="detail-kv"><span>Open reviews</span><strong>{String(financeSnapshot.openReviews)}</strong></div>
          </div>
        </div>

        <div className="customer360-section">
          <div className="section-head">
            <h2>Contract records</h2>
          </div>
          <div className="section-desc">
            Uploaded agreements, proposals, NDAs, extracted critical fields, and the billing
            schedule that Setu used to prefill onboarding and invoice drafts.
          </div>
          <div className="tcard">
            {contractRecords.length ? (
              contractRecords.map((contract) => {
                const serviceSummary = summarizeServiceLabels(
                  contract.services.map((service) => normalizeServiceLabel(service.name)),
                  6,
                );

                return (
                  <div className="contract-record-row" key={contract.id}>
                    <div>
                      <div className="cust">{contract.fileName}</div>
                      <div className="contract-badge-row">
                        <span className="contract-kind-badge">
                          {contract.contractKindLabel || "Supporting document"}
                        </span>
                        <span className="contract-kind-note">{getContractUsageLabel(contract)}</span>
                      </div>
                      <div className="sub">
                        Uploaded {formatDateTimeValue(contract.uploadedAt)}
                        {contract.uploadedByUsername ? ` · by ${contract.uploadedByUsername}` : ""}
                        {contract.contractDate ? ` · Contract ${formatLongDate(contract.contractDate)}` : ""}
                      </div>
                    </div>
                    <div className="contract-record-meta">
                      <div className="sub">
                        {contract.serviceStartDate
                          ? `Start ${formatLongDate(contract.serviceStartDate)}`
                          : "Start date not captured"}
                      </div>
                      <div className="sub">
                        {contract.totalFee ? formatCurrency(contract.totalFee) : "Fee pending"} ·{" "}
                        {contract.installmentCount} installment
                        {contract.installmentCount === 1 ? "" : "s"}
                      </div>
                      <div className="contract-service-cloud">
                        {serviceSummary.visible.length ? (
                          serviceSummary.visible.map((service) => (
                            <span className="compact-service-pill" key={`${contract.id}-${service}`}>
                              {service}
                            </span>
                          ))
                        ) : (
                          <span className="sub">No services extracted</span>
                        )}
                        {serviceSummary.overflowCount ? (
                          <span className="compact-service-pill muted">
                            +{serviceSummary.overflowCount} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="contract-record-actions">
                      <a className="btn btn-sm" href={contract.downloadPath} rel="noreferrer" target="_blank">
                        Open
                      </a>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">No contracts have been uploaded for this customer yet.</div>
            )}
          </div>
        </div>

        <div className="customer360-section">
          <div className="section-head">
            <h2>Service history</h2>
          </div>
          <div className="section-desc">
            Every enrollment is timestamped so later add-ons remain visible in the customer record.
          </div>
          <div className="tcard">
            {serviceHistory.length ? (
              serviceHistory.map((entry) => (
                <div className="trow customer360-service-row" key={entry.id}>
                  <div>
                    <div className="cust">{normalizeServiceLabel(entry.name)}</div>
                    <div className="sub">{entry.isCustom ? "Custom service" : "EB1A criterion / standard service"}</div>
                  </div>
                  <div className="mono">{formatEnrollmentTimestamp(entry.enrolledAt)}</div>
                </div>
              ))
            ) : (
              <div className="empty">No service history captured yet.</div>
            )}
          </div>
        </div>

        <div className="customer360-section">
          <div className="section-head">
            <h2>Invoice ledger</h2>
          </div>
          <div className="section-desc">
            Current and historical invoice records linked to this customer.
          </div>
          <div className="tcard">
            <div className="trow head customer-invoice-grid">
              <div>Due</div>
              <div>Service</div>
              <div>Status</div>
              <div>Amount</div>
              <div>Reference</div>
            </div>
            {customerInvoices.length ? (
              customerInvoices.map((invoice) => (
                <div className="trow customer-invoice-grid" key={invoice.id}>
                  <div className="mono">{formatShortDate(invoice.dueDate)}</div>
                  <div>
                    <div className="cust">{invoice.service}</div>
                    <div className="sub">
                      {invoice.milestone} · {invoice.source}
                      {invoice.referralBonusAmount ? ` · bonus ${formatCurrency(invoice.referralBonusAmount)}` : ""}
                    </div>
                  </div>
                  <div>
                    <span className={`search-status-chip tone-${formatInvoiceStatusTone(invoice.status)}`}>
                      {formatInvoiceStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <div className="mono">{formatCurrency(invoice.zelleAmount ?? invoice.cardAmount ?? 0)}</div>
                  <div className="mono">{invoice.invoiceCode}</div>
                </div>
              ))
            ) : (
              <div className="empty">No invoices linked to this customer yet.</div>
            )}
          </div>
        </div>

        <div className="customer360-section">
          <div className="section-head">
            <h2>Transaction ledger</h2>
          </div>
          <div className="section-desc">
            Saved payment history, including when transactions were received and when they were applied.
          </div>
          <div className="tcard">
            <div className="trow head customer-payment-grid">
              <div>Applied</div>
              <div>Received</div>
              <div>Status</div>
              <div>Amount</div>
              <div>Reference / memo</div>
            </div>
            {customerPayments.length ? (
              customerPayments.map((payment) => {
                const paymentHasException =
                  payment.reviewStatus === "exception" ||
                  exceptions.some((exception) => exception.sourceMessageId === payment.sourceMessageId);
                const paymentStatus = payment.appliedAt
                  ? { label: "Applied", tone: "success" }
                  : paymentHasException
                    ? { label: "Needs review", tone: "danger" }
                    : pendingPaymentIds.has(payment.id)
                      ? { label: "Ready to apply", tone: "ink" }
                      : { label: "Saved", tone: "neutral" };

                return (
                  <div className="trow customer-payment-grid" key={payment.id}>
                    <div className="mono">{payment.appliedAt ? formatDateTimeValue(payment.appliedAt) : "Not applied yet"}</div>
                    <div className="mono">{payment.transactionDate ? formatTransactionDate(payment.transactionDate) : formatDateTimeValue(payment.receivedAt)}</div>
                    <div>
                      <span className={`search-status-chip tone-${paymentStatus.tone}`}>{paymentStatus.label}</span>
                    </div>
                    <div className="mono">{formatCurrency(payment.amountReceived ?? 0)}</div>
                    <div>
                      <div className="mono">{payment.transactionReference ?? "No transaction ref"}</div>
                      <div className="sub">{payment.memo ?? payment.matchSummary ?? "Saved payment record"}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">No saved transactions linked to this customer yet.</div>
            )}
          </div>
        </div>

        <div className="customer360-section">
          <div className="section-head">
            <h2>Referrals and open reviews</h2>
          </div>
          <div className="section-desc">
            Referral relationships, earned rewards, and any transaction issues still waiting on human review.
          </div>
          <div className="detail-grid customer360-detail-grid">
            <div className="detail-card">
              <div className="detail-label">Referral relationships</div>
              {referralsMade.length || referralSourceRecord ? (
                <div className="customer360-stack">
                  {referralSourceRecord ? (
                    <div className="customer360-inline-card">
                      <div className="cust">Referred into Setu</div>
                      <div className="sub">
                        {referrerCustomer ? `${referrerCustomer.name} · ${formatCustomerReference(referrerCustomer)}` : referralSourceRecord.referrerCustomerName}
                      </div>
                      <div className="sub">
                        {formatReferralRelationshipLabel(referralSourceRecord.relationshipLabel)} ·{" "}
                        {referralSourceRecord.referredOn ? formatLongDate(referralSourceRecord.referredOn) : "Date not captured"}
                      </div>
                    </div>
                  ) : null}
                  {referralsMade.map((referral) => (
                    <div className="customer360-inline-card" key={referral.id}>
                      <div className="cust">{referral.referredCustomerName}</div>
                      <div className="sub">
                        {formatReferralRelationshipLabel(referral.relationshipLabel)} ·{" "}
                        {referral.referredOn ? formatLongDate(referral.referredOn) : "Date not captured"}
                      </div>
                      <div className="sub">
                        {formatCurrency(referral.bonusAmount)} bonus · {formatCurrency(referral.qualifyingPaidAmount)} paid or{" "}
                        {referral.qualifyingMonths} months
                      </div>
                      <div className="sub">
                        <span className={`search-status-chip tone-${formatReferralStatusTone(referral.status)}`}>
                          {formatReferralStatusLabel(referral.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty customer360-inline-empty">No referral relationships on this record yet.</div>
              )}
            </div>

            <div className="detail-card">
              <div className="detail-label">Reward ledger</div>
              {relatedRewards.length ? (
                <div className="customer360-stack">
                  {relatedRewards.map((reward) => (
                    <div className="customer360-inline-card" key={reward.id}>
                      <div className="cust">{formatCurrency(reward.amount ?? 0)}</div>
                      <div className="sub">
                        {reward.description ?? reward.rewardType ?? "Referral reward"} ·{" "}
                        <span className={`search-status-chip tone-${formatRewardStatusTone(reward.status)}`}>
                          {reward.status}
                        </span>
                      </div>
                      {reward.appliedInvoiceCode ? (
                        <div className="sub">Applied to invoice {reward.appliedInvoiceCode}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty customer360-inline-empty">No rewards linked to this customer yet.</div>
              )}
            </div>
          </div>

          {customerExceptions.length ? (
            <div className="tcard customer360-review-card">
              <div className="trow head customer-review-grid">
                <div>Review type</div>
                <div>Summary</div>
                <div>Transaction</div>
              </div>
              {customerExceptions.map((exception) => (
                <div className="trow customer-review-grid" key={exception.id}>
                  <div>
                    <span className="search-status-chip tone-danger">
                      {exception.kind === "ambiguous"
                        ? "Ambiguous"
                        : exception.kind === "duplicate"
                          ? exception.summary?.toLowerCase().includes("abuse")
                            ? "Abuse risk"
                            : "Duplicate"
                          : "Mismatch"}
                    </span>
                  </div>
                  <div className="sub">{exception.summary}</div>
                  <div className="mono">
                    {formatCurrency(exception.amount ?? 0)} · {exception.transactionReference ?? "No transaction ref"}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {customerExceptionHistory.length ? (
            <div className="tcard customer360-review-card">
              <div className="trow head customer-history-grid">
                <div>Resolved</div>
                <div>Action</div>
                <div>Transaction</div>
                <div>By</div>
              </div>
              {customerExceptionHistory.map((item) => (
                <div className="trow customer-history-grid" key={item.id}>
                  <div className="mono">{formatDateTimeValue(item.resolvedAt)}</div>
                  <div>
                    <div className="cust">{formatExceptionResolutionAction(item.resolutionAction)}</div>
                    <div className="sub">{item.resolutionMessage ?? item.summary}</div>
                  </div>
                  <div className="mono">
                    {formatCurrency(item.amount ?? 0)} · {item.transactionReference ?? "No transaction ref"}
                  </div>
                  <div className="sub">{item.resolvedByUsername ?? "Unknown user"}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SendPreviewModal({ invoice, onClose, onSend }) {
  if (!invoice) {
    return null;
  }

  return (
    <>
      <div className="modal-head">
        <h3>Invoice preview</h3>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <div className="note info">
          <IconCircleCheckFilled size={16} />
          <div>Generated from the schedule sheet. Customer details are already filled in.</div>
        </div>
        <div>
          <div className="kv">
            <span className="k">To</span>
            <span>{invoice.customerName}</span>
          </div>
          <div className="kv">
            <span className="k">Service</span>
            <span>
              {invoice.service} — {invoice.milestone}
            </span>
          </div>
          <div className="kv">
            <span className="k">Zelle ({invoice.discountPct}% off)</span>
            <span className="price-accent">{formatCurrency(invoice.zelleAmount)}</span>
          </div>
          {invoice.referralBonusAmount ? (
            <div className="kv">
              <span className="k">Referral bonus discount</span>
              <span className="mono">-{formatCurrency(invoice.referralBonusAmount)}</span>
            </div>
          ) : null}
          <div className="kv">
            <span className="k">Card price</span>
            <span className="mono">{formatCurrency(invoice.cardAmount)}</span>
          </div>
          <div className="kv">
            <span className="k">Memo / ref</span>
            <span className="mono">{invoice.invoiceCode}</span>
          </div>
          <div className="kv">
            <span className="k">Due</span>
            <span>{formatLongDate(invoice.dueDate)}</span>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={() => onSend(invoice.id)}>
          Send invoice
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function TransactionDetailsPanel({
  amount,
  customerCode,
  customerName,
  dateLabel,
  matchedInvoiceCode,
  matchedSignals,
  memo,
  messageDateHeader,
  messageFromEmail,
  messageToEmail,
  rawText,
  receivedAt,
  reviewNotes,
  score,
  senderEmail,
  senderName,
  senderPhoneLast4,
  sourceMessageId,
  sourceProvider,
  sourceThreadId,
  subject,
  transactionDate,
  transactionReference,
  summary,
}) {
  const [showRawExtract, setShowRawExtract] = useState(false);
  const rawTextPreview = createPreviewSnippet(rawText);

  return (
    <>
      <div className="transaction-panel">
        <div className="detail-banner">
          <div>
            <div className="detail-label">Saved transaction record</div>
            <div className="detail-title">
              {senderName || customerName || "Unknown sender"} · {formatCurrency(amount || 0)}
            </div>
            <div className="sub">
              {transactionReference ?? "No transaction reference"} · {memo ?? "No memo captured"}
            </div>
          </div>
          <div className="detail-score-wrap">
            <div className="score hi">{score ?? 0}</div>
            <div className="sub">{matchedSignals?.length ? matchedSignals.join(" · ") : "Awaiting review"}</div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-card">
            <div className="detail-label">Matching snapshot</div>
            <div className="detail-kv"><span>Customer</span><strong>{customerName ?? "Not assigned"}</strong></div>
            <div className="detail-kv"><span>Customer ID</span><strong>{customerCode ?? "Not assigned"}</strong></div>
            <div className="detail-kv"><span>Invoice</span><strong>{matchedInvoiceCode ?? "Not assigned"}</strong></div>
            <div className="detail-kv"><span>Summary</span><strong>{summary ?? "No match summary yet"}</strong></div>
            {reviewNotes ? <div className="detail-note">{reviewNotes}</div> : null}
          </div>

          <div className="detail-card">
            <div className="detail-label">Zelle email capture</div>
            <div className="detail-kv"><span>Transaction ref</span><strong>{transactionReference ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Memo</span><strong>{memo ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Transaction date</span><strong>{transactionDate ? formatTransactionDate(transactionDate) : dateLabel ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Inbox received</span><strong>{formatDateTimeValue(receivedAt)}</strong></div>
            <div className="detail-kv"><span>Email header date</span><strong>{messageDateHeader ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Subject</span><strong>{subject ?? "Not captured"}</strong></div>
          </div>

          <div className="detail-card">
            <div className="detail-label">Identity fields</div>
            <div className="detail-kv"><span>Payer name</span><strong>{senderName ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Payer email</span><strong>{senderEmail ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Payer phone</span><strong>{senderPhoneLast4 ? `••••${senderPhoneLast4}` : "Not captured"}</strong></div>
            <div className="detail-kv"><span>Bank sender</span><strong>{messageFromEmail ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Inbox destination</span><strong>{messageToEmail ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Provider</span><strong>{sourceProvider ?? "gmail"}</strong></div>
          </div>

          <div className="detail-card">
            <div className="detail-label">Trace fields</div>
            <div className="detail-kv"><span>Source message ID</span><strong>{sourceMessageId ?? "Not captured"}</strong></div>
            <div className="detail-kv"><span>Thread ID</span><strong>{sourceThreadId ?? "Not captured"}</strong></div>
          </div>
        </div>

        <div className="detail-card detail-card-wide">
          <div className="detail-inline-head">
            <div>
              <div className="detail-label">Raw extracted email text</div>
              <div className="sub">Hidden by default for faster review. Open the full extract only when needed.</div>
            </div>
            <button className="btn btn-sm" type="button" onClick={() => setShowRawExtract(true)}>
              Open raw extract
            </button>
          </div>
          <div className="detail-collapsed-box">
            <div className="detail-pre-preview">{rawTextPreview}</div>
          </div>
        </div>
      </div>
      <ModalShell show={showRawExtract} onClose={() => setShowRawExtract(false)} size="wide">
        <>
          <div className="modal-head">
            <div>
              <h3>Raw email extract</h3>
              <div className="sub modal-sub">
                Full extracted text captured from the synced email for manual verification.
              </div>
            </div>
            <button className="x" onClick={() => setShowRawExtract(false)}>
              <IconX size={18} />
            </button>
          </div>
          <div className="modal-body">
            <div className="detail-card detail-card-wide">
              <pre className="detail-pre detail-pre-popout">{rawText || "No email text was extracted."}</pre>
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn" type="button" onClick={() => setShowRawExtract(false)}>
              Close
            </button>
          </div>
        </>
      </ModalShell>
    </>
  );
}

function PaymentReviewModal({ onApply, onClose, payment }) {
  if (!payment) {
    return null;
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <h3>Review transaction before apply</h3>
          <div className="sub modal-sub">
            One click will apply the payment and mark the invoice paid. Send the customer receipt
            separately from completed transactions when you are ready.
          </div>
        </div>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <TransactionDetailsPanel
          amount={payment.amountReceived}
          customerCode={payment.customerCode}
          customerName={payment.customerName}
          dateLabel={payment.dateLabel}
          matchedInvoiceCode={payment.matchedInvoiceCode}
          matchedSignals={payment.matchedSignals}
          memo={payment.memo}
          messageDateHeader={payment.messageDateHeader}
          messageFromEmail={payment.messageFromEmail}
          messageToEmail={payment.messageToEmail}
          rawText={payment.rawText}
          receivedAt={payment.receivedAt}
          reviewNotes={payment.reviewNotes}
          score={payment.score}
          senderEmail={payment.senderEmail}
          senderName={payment.senderNameRaw}
          senderPhoneLast4={payment.senderPhoneLast4}
          sourceMessageId={payment.sourceMessageId}
          sourceProvider={payment.sourceProvider}
          sourceThreadId={payment.sourceThreadId}
          subject={payment.subject}
          summary={payment.matchSummary}
          transactionDate={payment.transactionDate}
          transactionReference={payment.transactionReference}
        />
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={() => onApply(payment.id)}>
          Apply transaction
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

function ManualPaymentModal({
  customerQuery,
  customerResults,
  form,
  invoices = [],
  onChange,
  onClose,
  onCustomerQueryChange,
  onSubmit,
  saving,
  selectedCustomer,
}) {
  const customerInvoices = selectedCustomer
    ? invoices.filter((invoice) => invoice.customerId === selectedCustomer.id && invoice.status !== "paid")
    : [];
  const selectedRoute = MANUAL_PAYMENT_ROUTES.find((route) => route.value === form.paymentRoute);

  return (
    <>
      <div className="modal-head">
        <div>
          <h3>Record secured payment</h3>
          <div className="sub modal-sub">
            Use this only after funds are confirmed outside Gmail sync. The payment is applied now;
            receipt sending stays a separate action from completed transactions.
          </div>
        </div>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <div className="note warn">
          <IconAlertTriangle size={16} />
          <div>
            If a Zelle transaction number already exists in the ledger, Setu blocks it and flags it
            as a possible abuse/replay risk instead of applying it again.
          </div>
        </div>
        <div className="field">
          <label>Customer</label>
          <div className="search-wrap modal-search">
            <IconSearch size={18} />
            <input
              className="search-input"
              value={customerQuery}
              onChange={(event) => onCustomerQueryChange(event.target.value)}
              placeholder="Search by customer ID, phone, email, first name, or last name"
            />
          </div>
          {selectedCustomer ? (
            <div className="autofill-note">
              Selected {selectedCustomer.name} · Customer ID {formatCustomerReference(selectedCustomer)}
            </div>
          ) : null}
          {customerQuery.trim() ? (
            <div className="picker-results">
              {customerResults.length ? (
                customerResults.map((customer) => (
                  <div className="candidate" key={customer.id}>
                    <div>
                      <div className="name">{customer.name}</div>
                      <div className="meta">
                        Customer ID {formatCustomerReference(customer)} · {summarizeContacts(customer)}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        onChange({ selectedCustomerId: customer.id, invoiceId: "" });
                        onCustomerQueryChange(customer.name);
                      }}
                    >
                      Use customer
                    </button>
                  </div>
                ))
              ) : (
                <div className="picker-empty">No existing customer matches that search.</div>
              )}
            </div>
          ) : null}
        </div>

        <div className="field-row">
          <div className="field">
            <label>Amount received</label>
            <input
              min="0"
              step="0.01"
              type="number"
              value={form.amountReceived}
              onChange={(event) => onChange({ amountReceived: event.target.value })}
              placeholder="1000.02"
            />
          </div>
          <div className="field">
            <label>Payment date</label>
            <input
              type="date"
              value={form.transactionDate}
              onChange={(event) => onChange({ transactionDate: event.target.value })}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Funds secured through</label>
            <select
              value={form.paymentRoute}
              onChange={(event) => onChange({ paymentRoute: event.target.value })}
            >
              {MANUAL_PAYMENT_ROUTES.map((route) => (
                <option key={route.value} value={route.value}>
                  {route.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Transaction / confirmation number</label>
            <input
              value={form.transactionReference}
              onChange={(event) => onChange({ transactionReference: event.target.value })}
              placeholder={form.paymentRoute === "manual_zelle" ? "Zelle transaction number" : "Optional reference"}
            />
          </div>
        </div>

        <div className="field">
          <label>Invoice to mark paid</label>
          <select
            disabled={!selectedCustomer}
            value={form.invoiceId}
            onChange={(event) => onChange({ invoiceId: event.target.value })}
          >
            <option value="">Auto-match by amount or leave invoice pending</option>
            {customerInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceCode} · {invoice.service} {invoice.milestone || ""} ·{" "}
                {formatCurrency(invoice.zelleAmount)}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Memo</label>
            <input
              value={form.memo}
              onChange={(event) => onChange({ memo: event.target.value })}
              placeholder={selectedRoute?.label ?? "Payment memo"}
            />
          </div>
          <div className="field">
            <label>Internal note</label>
            <input
              value={form.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="Who verified funds, bank note, or context"
            />
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={saving || !selectedCustomer || !Number(form.amountReceived)}
        >
          {saving ? "Recording…" : "Record & apply payment"}
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}

function MismatchModal({ exception, onAccept, onCredit, onClose, onReject }) {
  if (!exception) {
    return null;
  }

  const difference = exception.amount - exception.expectedAmount;

  return (
    <>
      <div className="modal-head">
        <h3>
          Resolve: {exception.senderName} · {formatCurrency(exception.amount)}
        </h3>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <TransactionDetailsPanel
          amount={exception.amount}
          customerCode={exception.customerCode}
          customerName={exception.customerName}
          dateLabel={exception.dateLabel}
          matchedInvoiceCode={
            exception.service ? `${exception.service}${exception.milestone ? ` · ${exception.milestone}` : ""}` : null
          }
          matchedSignals={exception.matchedSignals}
          memo={exception.memo}
          messageDateHeader={exception.messageDateHeader}
          messageFromEmail={exception.messageFromEmail}
          messageToEmail={exception.messageToEmail}
          rawText={exception.rawText}
          receivedAt={exception.receivedAt}
          score={exception.score}
          senderEmail={exception.senderEmail}
          senderName={exception.senderName}
          senderPhoneLast4={exception.senderPhoneLast4}
          sourceMessageId={exception.sourceMessageId}
          sourceProvider={exception.sourceProvider}
          sourceThreadId={exception.sourceThreadId}
          subject={exception.subject}
          summary={exception.summary}
          transactionDate={exception.transactionDate}
          transactionReference={exception.transactionReference}
        />
        <div className="split">
          <div>
            <div className="col-label">Payment received</div>
            <div className="kv">
              <span className="k">Amount</span>
              <span className="mono">{formatCurrency(exception.amount)}</span>
            </div>
            <div className="kv">
              <span className="k">Sender</span>
              <span>{exception.senderEmail}</span>
            </div>
            <div className="kv">
              <span className="k">Phone</span>
              <span className="mono">••••{exception.senderPhoneLast4}</span>
            </div>
          </div>
          <div>
            <div className="col-label">Matched invoice</div>
            <div className="kv">
              <span className="k">Service</span>
              <span>
                {exception.service} {exception.milestone}
              </span>
            </div>
            <div className="kv">
              <span className="k">Expected</span>
              <span className="mono warn-text">{formatCurrency(exception.expectedAmount)}</span>
            </div>
            <div className="kv">
              <span className="k">Difference</span>
              <span className="mono warn-text">
                {difference > 0 ? "+" : ""}
                {formatCurrency(difference)}
              </span>
            </div>
          </div>
        </div>
        <div className="note warn">
          <IconAlertTriangle size={16} />
          <div>
            Name and phone matched, but the customer paid the full amount instead of the stored
            Zelle rate. Choose whether to move this into the apply queue as a full-payment override
            or leave the overage as credit.
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onAccept}>
          Approve full amount
        </button>
        <button className="btn" onClick={onCredit}>
          Apply {formatCurrency(difference)} as credit
        </button>
        <button className="btn btn-danger" onClick={onReject}>
          Reject / archive
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function ExceptionReviewModal({
  customers,
  exception,
  saveAlias,
  onChangeSaveAlias,
  onClose,
  onAcceptCandidate,
  onResolveCustomer,
  onRejectArchive,
  onAcceptTransaction,
}) {
  const [customerQuery, setCustomerQuery] = useState("");

  useEffect(() => {
    setCustomerQuery(exception?.customerName ?? exception?.senderName ?? "");
  }, [exception?.id, exception?.customerName, exception?.senderName]);

  if (!exception) {
    return null;
  }

  const isAmbiguous = exception.kind === "ambiguous";
  const isDuplicate = exception.kind === "duplicate";
  const allowManualCustomerMatch = !isDuplicate;
  const canAcceptTransaction = Boolean(!isDuplicate && exception.sourceMessageId && exception.customerId);
  const manualCustomerResults = customerQuery.trim()
    ? searchCustomersByIdentity(customers, customerQuery)
    : [];

  return (
    <>
      <div className="modal-head">
        <h3>
          {isAmbiguous ? "Resolve" : "Review"}: "{exception.senderName}" ·{" "}
          {formatCurrency(exception.amount)}
        </h3>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <TransactionDetailsPanel
          amount={exception.amount}
          customerCode={exception.customerCode}
          customerName={exception.customerName}
          dateLabel={exception.dateLabel}
          matchedInvoiceCode={
            exception.service ? `${exception.service}${exception.milestone ? ` · ${exception.milestone}` : ""}` : null
          }
          matchedSignals={exception.matchedSignals}
          memo={exception.memo}
          messageDateHeader={exception.messageDateHeader}
          messageFromEmail={exception.messageFromEmail}
          messageToEmail={exception.messageToEmail}
          rawText={exception.rawText}
          receivedAt={exception.receivedAt}
          score={exception.score}
          senderEmail={exception.senderEmail}
          senderName={exception.senderName}
          senderPhoneLast4={exception.senderPhoneLast4}
          sourceMessageId={exception.sourceMessageId}
          sourceProvider={exception.sourceProvider}
          sourceThreadId={exception.sourceThreadId}
          subject={exception.subject}
          summary={exception.summary}
          transactionDate={exception.transactionDate}
          transactionReference={exception.transactionReference}
        />
        {isAmbiguous ? (
          <>
            <div className="note warn">
              <IconUsers size={16} />
              <div>
                Name matched two customers and the Zelle email had no phone or email to break the
                tie. Choose the right record, then optionally save the alias for next time.
              </div>
            </div>
            {exception.candidates.map((candidate) => (
              <div className="candidate" key={candidate.customerId}>
                <div className="name">{candidate.name}</div>
                <div className="meta">{candidate.note}</div>
                <button
                  className={`btn btn-sm ${candidate.primary ? "btn-primary" : ""}`}
                  onClick={() => onAcceptCandidate(candidate)}
                >
                  Approve &amp; apply
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => onResolveCustomer(candidate)}
                >
                  Match only
                </button>
              </div>
            ))}
          </>
        ) : isDuplicate ? (
          <div className="note warn">
            <IconAlertTriangle size={16} />
            <div>
              This transaction appears to match a payment that was already applied. The portal
              blocked it from the apply queue so the invoice and referral totals are not counted
              twice. If the same Zelle transaction number was already applied, treat it as a
              possible abuse/replay risk and verify directly with bank records before doing
              anything outside the portal.
            </div>
          </div>
        ) : (
          <div className="note warn">
            <IconAlertCircle size={16} />
            <div>
              The parser saved the transaction, but there is not enough confidence to post it
              safely yet. Keep it in exceptions until more identity detail is available.
            </div>
          </div>
        )}
        {canAcceptTransaction ? (
          <div className="note">
            <IconCircleCheckFilled size={16} />
            <div>
              This exception is linked to {exception.customerName}. Accepting it applies the
              payment now and records the decision for audit.
            </div>
          </div>
        ) : null}
        {allowManualCustomerMatch ? (
          <div className="field">
            <label>Match to existing customer</label>
            <div className="search-wrap modal-search">
              <IconSearch size={18} />
              <input
                className="search-input"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search by customer ID, phone, email, first name, or last name"
              />
            </div>
            <div className="autofill-note">
              Assigning a customer moves this transaction into Payments to confirm so finance can
              review and apply it.
            </div>
            {customerQuery.trim() ? (
              <div className="picker-results">
                {manualCustomerResults.length ? (
                  manualCustomerResults.map((customer) => (
                    <div className="candidate" key={customer.id}>
                      <div className="name">{customer.name}</div>
                      <div className="meta">
                        Customer ID {formatCustomerReference(customer)} · {describeCustomerMatch(customer)} ·{" "}
                        {summarizeContacts(customer)}
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => onAcceptCandidate(customer)}
                      >
                        Approve &amp; apply
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => onResolveCustomer(customer)}
                      >
                        Assign only
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="picker-empty">No existing customer matches that search.</div>
                )}
              </div>
            ) : null}
            <label className="check-row">
              <input
                type="checkbox"
                checked={saveAlias}
                onChange={(event) => onChangeSaveAlias(event.target.checked)}
              />
              Save this sender as a Zelle identity alias so future payments auto-match
            </label>
          </div>
        ) : null}
      </div>
      <div className="modal-foot">
        {canAcceptTransaction ? (
          <button className="btn btn-primary" onClick={onAcceptTransaction}>
            Approve &amp; apply
          </button>
        ) : null}
        <button className="btn btn-danger" onClick={onRejectArchive}>
          {isDuplicate ? "Reject / archive duplicate" : "Reject / archive"}
        </button>
        <button className="btn" onClick={onClose}>
          {isDuplicate ? "Close" : "Close for later"}
        </button>
      </div>
    </>
  );
}

function DeleteArchivedExceptionModal({ exception, onClose, onDelete }) {
  const [confirmationText, setConfirmationText] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [reason, setReason] = useState("");

  if (!exception) {
    return null;
  }

  const canDelete = understood && confirmationText.trim().toUpperCase() === "DELETE" && reason.trim().length >= 8;

  return (
    <>
      <div className="modal-head">
        <h3>Delete archived exception</h3>
        <button className="x" onClick={onClose}>
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">
        <div className="note warn">
          <IconAlertTriangle size={16} />
          <div>
            This removes the record from the rejected / archived bucket, but keeps a soft-delete
            audit trail. It cannot be applied or counted after deletion.
          </div>
        </div>
        <div className="detail-card">
          <div className="detail-label">Archived record</div>
          <div className="detail-title">{exception.senderName}</div>
          <div className="sub mono">
            {formatCurrency(exception.amount ?? 0)} · {exception.transactionReference ?? "No transaction ref"}
          </div>
          <div className="sub">{exception.summary}</div>
        </div>
        <div className="field">
          <label>Delete reason</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Example: Confirmed rejected duplicate after bank review."
          />
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          I understand this removes the record from the archived review bucket.
        </label>
        <div className="field">
          <label>Type DELETE to confirm</label>
          <input
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder="DELETE"
          />
        </div>
      </div>
      <div className="modal-foot">
        <button
          className="btn btn-danger"
          disabled={!canDelete}
          onClick={() =>
            onDelete({
              confirmationText,
              understood,
              reason,
            })
          }
        >
          Delete archived record
        </button>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>
          <IconCircleCheckFilled size={16} />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

function AskSetuWidget({
  exceptionCount,
  inputValue,
  messages,
  onInputChange,
  onOpenChange,
  onSubmit,
  open,
  pendingCount,
  suggestions,
}) {
  const listRef = useRef(null);

  useEffect(() => {
    if (!open || !listRef.current) {
      return;
    }

    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, open]);

  return (
    <div className={`ask-setu-shell ${open ? "open" : ""}`}>
      {open ? (
        <section className="ask-setu-panel">
          <div className="ask-setu-head">
            <div>
              <div className="ask-setu-kicker">Quick answers</div>
              <h3>Ask Setu</h3>
              <div className="ask-setu-sub">Local only · answers from the current portal state</div>
            </div>
            <button className="ask-setu-close" type="button" onClick={() => onOpenChange(false)}>
              <IconX size={16} />
            </button>
          </div>

          <div className="ask-setu-meta">
            <span>{pendingCount} pending</span>
            <span>{exceptionCount} exceptions</span>
          </div>

          <div className="ask-setu-suggestions">
            {suggestions.map((suggestion) => (
              <button
                className="ask-setu-chip"
                key={suggestion}
                type="button"
                onClick={() => onSubmit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="ask-setu-messages" ref={listRef}>
            {messages.map((message) => (
              <div
                className={`ask-setu-message ${message.role === "user" ? "user" : "assistant"}`}
                key={message.id}
              >
                <div className="ask-setu-message-role">
                  {message.role === "user" ? "You" : "Setu"}
                </div>
                <div className="ask-setu-message-body">{message.text}</div>
              </div>
            ))}
          </div>

          <form
            className="ask-setu-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(inputValue);
            }}
          >
            <input
              className="ask-setu-input"
              placeholder="Ask about a customer, payment, invoice, sync, or status"
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
            />
            <button className="ask-setu-send" type="submit" disabled={!inputValue.trim()}>
              Ask
            </button>
          </form>
        </section>
      ) : null}

      <button className="ask-setu-toggle" type="button" onClick={() => onOpenChange(!open)}>
        <IconHelpCircle size={17} />
        <span>Ask Setu</span>
        <strong>{pendingCount + exceptionCount}</strong>
      </button>
    </div>
  );
}

function buildAttentionItems(exceptions) {
  const items = [
    {
      id: "overdue-30",
      label: "Overdue 30+ days",
      customer: "Karthik Nair",
      impact: "$1,400 · Full M2",
      action: "Review",
      attn: true,
      icon: <IconAlertCircle className="danger-icon" size={16} />,
    },
  ];

  const mappedExceptions = exceptions.map((exception) => ({
    id: exception.id,
    label:
      exception.kind === "mismatch"
        ? "Amount mismatch"
        : exception.kind === "duplicate"
          ? exception.summary?.toLowerCase().includes("abuse")
            ? "Possible abuse / replay"
            : "Possible duplicate"
          : exception.kind === "ambiguous"
            ? "Ambiguous payer"
            : "Manual review",
    customer: exception.senderName,
    impact:
      exception.kind === "mismatch"
        ? `paid ${formatCurrency(exception.amount)} / exp ${formatCurrency(exception.expectedAmount)}`
        : exception.kind === "duplicate"
          ? exception.summary?.toLowerCase().includes("abuse")
            ? "same transaction number"
            : "already applied once"
          : exception.kind === "ambiguous"
            ? "2 customers match"
            : "saved but not matched",
    action: exception.kind === "duplicate" ? "Review" : exception.kind === "mismatch" ? "Review" : "Resolve",
    attn: false,
    icon:
      exception.kind === "mismatch" ? (
        <IconHelpCircle className="warn-icon" size={16} />
      ) : (
        <IconHelpCircle className="warn-icon" size={16} />
      ),
  }));

  return [...items, ...mappedExceptions];
}

function buildMatchLine(customer, query) {
  if (!customer.matchField) {
    return customer.emails[0]?.value ?? "No email on file";
  }

  const labels = {
    name: "matched name",
    customerId: "matched customer ID",
    email: "matched email",
    phone: "matched phone",
    alias: "matched payment alias",
    invoice: "matched invoice",
  };

  return `${labels[customer.matchField]} ${highlightMatch(customer.matchValue, query)}`;
}

export default App;
