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
  IconTable,
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
  publicReferral: "/refer",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  console: "/billing",
  search: "/customers",
  admin: "/admin",
};

function createPortalRoute(view = "dashboard", customerId = "") {
  return {
    view,
    customerId,
  };
}

function buildPortalPath(route) {
  if (route?.view === "customer360" && route.customerId) {
    return `/customers/${encodeURIComponent(route.customerId)}`;
  }

  return PORTAL_VIEW_PATHS[route?.view] ?? PORTAL_VIEW_PATHS.dashboard;
}

function parsePortalRoute(pathname = "/") {
  const normalizedPath = String(pathname || "/").replace(/\/+$/, "") || "/";
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

function createAskSetuMessage(role, text) {
  return {
    id: crypto.randomUUID(),
    role,
    text,
  };
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

function formatExceptionResolutionAction(action) {
  const labels = {
    matched_customer: "Matched to customer",
    accept_full: "Accepted as full payment",
    apply_credit: "Marked for future credit",
    mark_duplicate: "Archived duplicate",
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
  const [onboardingCustomerQuery, setOnboardingCustomerQuery] = useState("");
  const [onboardingForm, setOnboardingForm] = useState(DEFAULT_ONBOARDING_FORM);
  const [contractUploads, setContractUploads] = useState([]);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [savingReferralProgram, setSavingReferralProgram] = useState(false);
  const [applyingReferralRewardId, setApplyingReferralRewardId] = useState("");
  const [reviewingReferralSubmissionId, setReviewingReferralSubmissionId] = useState("");
  const [saveAlias, setSaveAlias] = useState(true);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [sendingReceiptId, setSendingReceiptId] = useState("");
  const [referralProgramForm, setReferralProgramForm] = useState(() =>
    createReferralProgramForm(createInitialState().admin?.referralProgram),
  );
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
  const isPublicReferralRoute = view === "publicReferral";
  const navView = route.view === "customer360" ? "search" : route.view;

  const searchResults = searchCustomers(state.customers, searchQuery);
  const needsAttention = buildAttentionItems(state.exceptions);
  const nextInvoicePreview = createInvoiceRefPreview(state.nextInvoiceSequence);
  const zellePreview = calculateZelleAmount(invoiceForm.amount, invoiceForm.discountPct);
  const selectedCustomer =
    state.customers.find((customer) => customer.id === invoiceForm.selectedCustomerId) ?? null;
  const invoiceCustomerResults = invoiceCustomerQuery.trim()
    ? searchCustomersByIdentity(state.customers, invoiceCustomerQuery)
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
    setOnboardingCustomerQuery("");
    setOnboardingForm({ ...DEFAULT_ONBOARDING_FORM });
    setContractUploads([]);
    setUploadingContract(false);
    setSavingOnboarding(false);
    setSavingReferralProgram(false);
    setApplyingReferralRewardId("");
    setReviewingReferralSubmissionId("");
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
    if (isPublicReferralRoute) {
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
  }, [isPublicReferralRoute]);

  useEffect(() => {
    if (!isPublicReferralRoute) {
      return;
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
  }, [isPublicReferralRoute]);

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
      setPublicReferralForm(DEFAULT_PUBLIC_REFERRAL_FORM);
      setPublicReferralMessage(data.message);
    } catch (error) {
      setPublicReferralError(error.message || "Could not submit the referral right now.");
    } finally {
      setSubmittingPublicReferral(false);
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

  if (isPublicReferralRoute) {
    return (
      <>
        <PublicReferralView
          error={publicReferralError}
          form={publicReferralForm}
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
          <button className="wordmark logo-home" onClick={() => navigateToView("dashboard")} type="button">
            <span className="letters">setu</span>
            <span className="deck" />
          </button>
        </div>
        <div className="nav-label">Finance</div>
        <button
          className={`nav-item ${navView === "onboarding" ? "active" : ""}`}
          onClick={() => navigateToView("onboarding")}
        >
          <IconUsers size={17} />
          Client onboarding
        </button>
        <button
          className={`nav-item ${navView === "dashboard" ? "active" : ""}`}
          onClick={() => navigateToView("dashboard")}
        >
          <IconLayoutDashboard size={17} />
          Dashboard
        </button>
        <button
          className={`nav-item ${navView === "console" ? "active" : ""}`}
          onClick={() => navigateToView("console")}
        >
          <IconFileInvoice size={17} />
          Billing console
          <span className="badge">{counts.due + counts.confirm + counts.exceptions}</span>
        </button>
        <button
          className={`nav-item ${navView === "search" ? "active" : ""}`}
          onClick={() => navigateToView("search")}
        >
          <IconSearch size={17} />
          Customer search
        </button>
        <button
          className={`nav-item ${navView === "admin" ? "active" : ""}`}
          onClick={() => navigateToView("admin")}
        >
          <IconTable size={17} />
          Referral Program
        </button>
        <div className="sidebar-foot">
          <div className="row">
            <IconCircleCheckFilled size={13} />
            Signed in as {auth.username}
          </div>
          <div className="sidebar-foot-note">Schedule sheet synced 5 min ago · phase 1</div>
          <button className="btn btn-sm sidebar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
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
            counts={counts}
            dueInvoices={state.dueInvoices}
            integrationStatus={state.integrationStatus}
            pendingPayments={state.pendingPayments}
            payments={state.payments}
            exceptions={state.exceptions}
            exceptionHistory={state.exceptionHistory ?? []}
            onOpenNewInvoice={openNewInvoice}
            onSendAll={sendAllInvoices}
            onPreviewInvoice={openSendPreview}
            onConfirmPayment={confirmPayment}
            onConfirmAll={confirmAllPayments}
            onSendReceipt={sendReceipt}
            onSyncInbox={syncInbox}
            onOpenPayment={(payment) => setModal({ type: "payment-review", payload: payment })}
            onOpenMismatch={(exception) => setModal({ type: "mismatch", payload: exception })}
            onOpenExceptionReview={(exception) => setModal({ type: "exception-review", payload: exception })}
            sendingReceiptId={sendingReceiptId}
            syncingInbox={syncingInbox}
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
        {view === "admin" && (
          <AdminView
            referralProgram={referralProgram}
            referralProgramForm={referralProgramForm}
            invoices={state.invoices}
            referralSubmissions={referralSubmissions}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            insights={referralInsights}
            saving={savingReferralProgram}
            applyingRewardId={applyingReferralRewardId}
            reviewingSubmissionId={reviewingReferralSubmissionId}
            onFormChange={(field, value) =>
              setReferralProgramForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSave={saveReferralProgram}
            onApplyReward={applyReferralReward}
            onConvertSubmission={convertReferralSubmission}
            onDismissSubmission={dismissReferralSubmissionEntry}
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
          onResolveCustomer={(candidate) => resolveExceptionCustomer(modal.payload?.id, candidate)}
          onArchiveDuplicate={() =>
            resolveMismatch(
              modal.payload?.id,
              "mark_duplicate",
              "Potential duplicate archived. It will not be counted or applied again.",
            )
          }
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
        <span className="wordmark auth-wordmark">
          <span className="letters">setu</span>
          <span className="deck" />
        </span>
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
          <span className="wordmark auth-wordmark">
            <span className="letters">setu</span>
            <span className="deck" />
          </span>
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

function PublicReferralView({
  error,
  form,
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

  return (
    <div className="auth-shell public-referral-shell">
      <div className="auth-grid public-referral-grid">
        <section className="auth-hero public-referral-hero">
          <span className="wordmark auth-wordmark">
            <span className="letters">setu</span>
            <span className="deck" />
          </span>
          <div className="auth-kicker">Referral intake</div>
          <h1>Share a friend or family referral.</h1>
          <p className="auth-copy">
            This public form does not require a login. Finance will review each entry before it
            becomes a tracked referral relationship in Setu Finance.
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
            <div className="sub">{program.programDescription}</div>
          </div>
          <button className="btn btn-sm public-referral-portal-link" type="button" onClick={onOpenPortal}>
            Open finance portal
          </button>
        </section>

        <section className="auth-card public-referral-card">
          <div className="auth-card-head">
            <div className="auth-card-label">No login required</div>
            <h2>Submit a referral</h2>
            <p className="auth-card-copy">
              Use the same customer ID and email that Setu already has on file for you.
            </p>
          </div>

          {loading && <div className="note info auth-note">Loading referral rules…</div>}
          {!program.enabled && <div className="note warn auth-note">Referral intake is currently disabled.</div>}
          {message && <div className="note info auth-note">{message}</div>}
          {error && <div className="note warn auth-note">{error}</div>}

          <form onSubmit={onSubmit}>
            <div className="field-row">
              <div className="field">
                <label htmlFor="refer-referrer-code">Your customer ID</label>
                <input
                  id="refer-referrer-code"
                  value={form.referrerCustomerCode}
                  onChange={(event) => onFieldChange("referrerCustomerCode", event.target.value)}
                  placeholder="100001"
                />
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
          <h1>Finance dashboard</h1>
          <div className="sub">
            {dashboard.dateLabel} · month to date
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
        <WorkflowStrip activeStep="invoice" />

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

function ConsoleView({
  counts,
  dueInvoices,
  integrationStatus,
  pendingPayments,
  payments,
  exceptions,
  exceptionHistory,
  onOpenPayment,
  onOpenNewInvoice,
  onSendAll,
  onPreviewInvoice,
  onConfirmPayment,
  onConfirmAll,
  onSendReceipt,
  onSyncInbox,
  onOpenMismatch,
  onOpenExceptionReview,
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

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Billing console</h1>
          <div className="sub">Schedule sheet synced 5 min ago · Bloom no longer needed</div>
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
        </div>
      </div>
      <div className="content">
        <div className="metrics c3">
          <MetricCard accent label="Invoices due to send" value={counts.due} />
          <MetricCard label="Payments to confirm" value={counts.confirm} />
          <MetricCard label="Exceptions" value={counts.exceptions} />
        </div>

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

        <section className="section">
          <div className="section-head">
            <h2>Exceptions</h2>
          </div>
          <div className="section-desc">
            The system could not safely auto-match these. A human decision is required.
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
                          ? "Possible duplicate payment"
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
                <div>
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
      </div>
    </div>
  );
}

function AdminView({
  referralProgram,
  referralProgramForm,
  insights,
  referralSubmissions,
  referrals,
  rewards,
  applyingRewardId,
  reviewingSubmissionId,
  saving,
  onApplyReward,
  onConvertSubmission,
  onDismissSubmission,
  onFormChange,
  onSave,
}) {
  const openReferralSubmissions = referralSubmissions.filter((submission) => submission.status === "submitted");
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
        <div className="metrics c4">
          <MetricCard accent label="Program status" value={referralProgram.enabled ? "Active" : "Disabled"} />
          <MetricCard label="Tracked relationships" value={referrals.length} />
          <MetricCard label="Open intake submissions" value={openReferralSubmissions.length} />
          <MetricCard label="Qualified bonuses" value={availableRewards.length} />
          <MetricCard label="Bonus spent" value={formatCurrency(insights?.totalBonusSpent ?? 0)} />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Referral rules</h2>
            <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
          <div className="section-desc">
            Keep the current program name, rule summary, and special campaign note here. Any changes
            only affect new referrals going forward, while each existing relationship keeps its own
            recorded rule snapshot.
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
                onChange={(event) => onFormChange("enabled", event.target.checked)}
              />
              Enable referral program for new client enrollments
            </label>
            <div className="field-row">
              <div className="field">
                <label>Program name</label>
                <input
                  value={referralProgramForm.programName}
                  onChange={(event) => onFormChange("programName", event.target.value)}
                  placeholder="Standard referral program"
                />
              </div>
              <div className="field">
                <label>Program note</label>
                <textarea
                  value={referralProgramForm.programDescription}
                  onChange={(event) => onFormChange("programDescription", event.target.value)}
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
                  onChange={(event) => onFormChange("bonusAmount", event.target.value)}
                />
              </div>
              <div className="field">
                <label>Qualifying paid amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={referralProgramForm.qualifyingPaidAmount}
                  onChange={(event) => onFormChange("qualifyingPaidAmount", event.target.value)}
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
                  onChange={(event) => onFormChange("qualificationMonths", event.target.value)}
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
                      {exception.kind === "ambiguous" ? "Ambiguous" : exception.kind === "duplicate" ? "Duplicate" : "Mismatch"}
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

function MismatchModal({ exception, onAccept, onCredit, onClose }) {
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
          Prepare full-payment apply
        </button>
        <button className="btn" onClick={onCredit}>
          Apply {formatCurrency(difference)} as credit
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
  onResolveCustomer,
  onArchiveDuplicate,
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
                  onClick={() => onResolveCustomer(candidate)}
                >
                  Match this
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
              twice.
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
                        onClick={() => onResolveCustomer(customer)}
                      >
                        Assign &amp; move forward
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
        {isDuplicate && (
          <button className="btn btn-primary" onClick={onArchiveDuplicate}>
            Archive duplicate
          </button>
        )}
        <button className="btn" onClick={onClose}>
          {isDuplicate ? "Close" : "Close for later"}
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
          ? "Possible duplicate"
          : exception.kind === "ambiguous"
            ? "Ambiguous payer"
            : "Manual review",
    customer: exception.senderName,
    impact:
      exception.kind === "mismatch"
        ? `paid ${formatCurrency(exception.amount)} / exp ${formatCurrency(exception.expectedAmount)}`
        : exception.kind === "duplicate"
          ? "already applied once"
          : exception.kind === "ambiguous"
            ? "2 customers match"
            : "saved but not matched",
    action: exception.kind === "duplicate" ? "Archive" : exception.kind === "mismatch" ? "Review" : "Resolve",
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
