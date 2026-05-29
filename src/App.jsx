import { useEffect, useId, useState } from "react";
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
  calculateZelleAmount,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  highlightMatch,
  makeInvoiceCode,
  searchCustomersByIdentity,
  searchCustomers,
  summarizeContacts,
} from "./lib/finance";
import { apiRequest, loadApiState, loadAuthStatus } from "./lib/api";

const DEFAULT_FORM = {
  selectedCustomerId: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  selectedEmail: "",
  service: "Authorship of scholarly articles",
  milestone: "",
  amount: 1500,
  discountPct: 5,
  dueDate: "2026-06-10",
};

const EB1A_CRITERIA_OPTIONS = [
  {
    code: "awards",
    label: "Lesser nationally or internationally recognized prizes or awards",
  },
  {
    code: "memberships",
    label: "Membership in associations that demand outstanding achievement",
  },
  {
    code: "published-material",
    label: "Published material about the client in major media",
  },
  {
    code: "judging",
    label: "Participation as a judge of the work of others",
  },
  {
    code: "original-contributions",
    label: "Original contributions of major significance",
  },
  {
    code: "authorship",
    label: "Authorship of scholarly articles",
  },
  {
    code: "exhibitions",
    label: "Display of work at artistic exhibitions or showcases",
  },
  {
    code: "critical-role",
    label: "Leading or critical role for distinguished organizations",
  },
  {
    code: "high-salary",
    label: "High salary or other significantly high remuneration",
  },
  {
    code: "commercial-success",
    label: "Commercial success in the performing arts",
  },
];

const DEFAULT_SERVICE_OPTIONS = [
  ...EB1A_CRITERIA_OPTIONS.map((option) => option.label),
  "Custom",
];

const DEFAULT_AUTH_FORM = {
  username: "admin",
  password: "",
};

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

const DEFAULT_ONBOARDING_FORM = {
  selectedCustomerId: "",
  referringCustomerId: "",
  firstName: "",
  lastName: "",
  customerEmail: "",
  customerPhone: "",
  onboardedAt: "",
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
    preferredPaymentMethod: customer?.profile?.preferredPaymentMethod ?? DEFAULT_ONBOARDING_FORM.preferredPaymentMethod,
    billingCadence: customer?.profile?.billingCadence ?? DEFAULT_ONBOARDING_FORM.billingCadence,
    zelleSenderName: zelleAlias?.name ?? "",
    zelleSenderEmail: zelleAlias?.email ?? "",
    zelleSenderPhoneLast4: zelleAlias?.phoneLast4 ?? "",
    referringCustomerId: customer?.profile?.referredByCustomerId ?? "",
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
  const normalized = String(serviceName || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    EB1A_CRITERIA_OPTIONS.find((option) => option.label.toLowerCase() === normalized) ??
    EB1A_CRITERIA_OPTIONS.find((option) => option.code === LEGACY_CRITERION_CODE_BY_NAME[normalized]) ??
    null
  );
}

function createOnboardingPrefillFromInvoice(form) {
  const { firstName, lastName } = splitCustomerName(form.customerName);
  const criterion = findCriterionOptionByServiceName(form.service);

  return {
    ...DEFAULT_ONBOARDING_FORM,
    firstName,
    lastName,
    customerEmail: form.customerEmail,
    customerPhone: form.customerPhone,
    criteriaSelections: criterion ? [createServiceSelectionEntry(criterion.code)] : [],
    customServices:
      form.service && !criterion
        ? [{ ...createCustomServiceEntry(), name: form.service }]
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

const BILLING_CADENCE_OPTIONS = [
  { value: "", label: "Use finance default" },
  { value: "per_milestone", label: "Per milestone" },
  { value: "monthly", label: "Monthly cycle" },
  { value: "custom", label: "Custom cadence" },
];

function createReferralProgramForm(config = {}) {
  return {
    enabled: config.enabled !== false,
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

function formatCustomerReference(customer) {
  return customer?.customerCode ?? customer?.id ?? "Unassigned";
}

function App() {
  const [view, setView] = useState("onboarding");
  const [state, setState] = useState(createInitialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState({ type: null, payload: null });
  const [invoiceForm, setInvoiceForm] = useState(DEFAULT_FORM);
  const [invoiceCustomerQuery, setInvoiceCustomerQuery] = useState("");
  const [onboardingCustomerQuery, setOnboardingCustomerQuery] = useState("");
  const [onboardingForm, setOnboardingForm] = useState(DEFAULT_ONBOARDING_FORM);
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [savingReferralProgram, setSavingReferralProgram] = useState(false);
  const [saveAlias, setSaveAlias] = useState(true);
  const [syncingInbox, setSyncingInbox] = useState(false);
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

  const counts = {
    onboarded: state.customers.length,
    due: state.dueInvoices.length,
    confirm: state.pendingPayments.length,
    exceptions: state.exceptions.length,
  };

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
  const onboardingCustomerResults = onboardingCustomerQuery.trim()
    ? searchCustomersByIdentity(state.customers, onboardingCustomerQuery)
    : [];
  const onboardingNeedsFollowUp = state.customers.filter(
    (customer) => customer.profile?.onboardingStatus === "needs_follow_up",
  ).length;
  const zelleReadyCount = state.customers.filter((customer) =>
    customer.aliases.some((alias) => alias.relation === "zelle identity"),
  ).length;
  const recentOnboardedCustomers = [...state.customers]
    .filter((customer) => customer.profile?.onboardedAt)
    .sort(
      (left, right) =>
        new Date(right.profile.onboardedAt).getTime() - new Date(left.profile.onboardedAt).getTime(),
    )
    .slice(0, 6);
  const currentOnboardingHistory = selectedOnboardingCustomer?.serviceHistory ?? [];
  const referralProgram = state.admin?.referralProgram ?? {
    enabled: true,
    bonusAmount: 500,
    qualifyingPaidAmount: 3000,
    qualificationMonths: 6,
  };

  useEffect(() => {
    setReferralProgramForm(createReferralProgramForm(state.admin?.referralProgram));
  }, [
    state.admin?.referralProgram?.enabled,
    state.admin?.referralProgram?.bonusAmount,
    state.admin?.referralProgram?.qualifyingPaidAmount,
    state.admin?.referralProgram?.qualificationMonths,
  ]);

  useEffect(() => {
    if (modal.type !== "ambiguous") {
      setSaveAlias(true);
    }
  }, [modal.type]);

  function resetPortalUi() {
    setView("onboarding");
    setState(createInitialState());
    setSearchQuery("");
    setModal({ type: null, payload: null });
    setInvoiceForm({ ...DEFAULT_FORM });
    setInvoiceCustomerQuery("");
    setOnboardingCustomerQuery("");
    setOnboardingForm({ ...DEFAULT_ONBOARDING_FORM });
    setSavingOnboarding(false);
    setSavingReferralProgram(false);
    setSaveAlias(true);
    setSyncingInbox(false);
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
  }, []);

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
    setView("onboarding");
    setModal({ type: null, payload: null });
    setOnboardingCustomerQuery("");
    setOnboardingForm({
      ...DEFAULT_ONBOARDING_FORM,
      ...(prefill ?? {}),
    });
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

  async function resolveAmbiguous(exceptionId, candidate) {
    try {
      const data = await apiRequest(`/api/exceptions/${exceptionId}/resolve`, {
        method: "POST",
        body: {
          actionType: "matched_customer",
          candidateCustomerId: candidate.customerId,
          saveAlias,
        },
      });
      setState(data.state);
      closeModal();
      pushToast(
        saveAlias
          ? `Matched to ${candidate.name}. Alias saved for future payments`
          : `Matched to ${candidate.name}`,
      );
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function saveReferralProgram() {
    const bonusAmount = Number(referralProgramForm.bonusAmount);
    const qualifyingPaidAmount = Number(referralProgramForm.qualifyingPaidAmount);
    const qualificationMonths = Number(referralProgramForm.qualificationMonths);

    if (
      !Number.isFinite(bonusAmount) ||
      !Number.isFinite(qualifyingPaidAmount) ||
      !Number.isFinite(qualificationMonths)
    ) {
      pushToast("Enter valid referral rule values before saving.");
      return;
    }

    setSavingReferralProgram(true);
    try {
      const data = await apiRequest("/api/admin/referral-program", {
        method: "POST",
        body: {
          config: {
            enabled: referralProgramForm.enabled,
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

  function updateForm(field, value) {
    setInvoiceForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateOnboardingForm(field, value) {
    setOnboardingForm((current) => ({
      ...current,
      [field]: value,
    }));
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
        homeAddressLine1: current.homeAddressLine1,
        homeAddressLine2: current.homeAddressLine2,
        homeCity: current.homeCity,
        homeState: current.homeState,
        homePostalCode: current.homePostalCode,
        homeCountry: current.homeCountry,
        preferredPaymentMethod: current.preferredPaymentMethod,
        billingCadence: current.billingCadence,
        zelleSenderName: current.zelleSenderName,
        zelleSenderEmail: current.zelleSenderEmail,
        zelleSenderPhoneLast4: current.zelleSenderPhoneLast4,
        referringCustomerId: current.referringCustomerId,
        referralSource: current.referralSource,
        billingNotes: current.billingNotes,
      }));
    }
  }

  function selectOnboardingCustomer(customerId) {
    if (!customerId) {
      setOnboardingCustomerQuery("");
      setOnboardingForm(DEFAULT_ONBOARDING_FORM);
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
          },
        },
      });
      setState(data.state);
      setOnboardingForm(DEFAULT_ONBOARDING_FORM);
      setOnboardingCustomerQuery("");
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
          <span className="wordmark">
            <span className="letters">setu</span>
            <span className="deck" />
          </span>
        </div>
        <div className="nav-label">Finance</div>
        <button
          className={`nav-item ${view === "onboarding" ? "active" : ""}`}
          onClick={() => setView("onboarding")}
        >
          <IconUsers size={17} />
          Client onboarding
        </button>
        <button
          className={`nav-item ${view === "dashboard" ? "active" : ""}`}
          onClick={() => setView("dashboard")}
        >
          <IconLayoutDashboard size={17} />
          Dashboard
        </button>
        <button
          className={`nav-item ${view === "console" ? "active" : ""}`}
          onClick={() => setView("console")}
        >
          <IconFileInvoice size={17} />
          Billing console
          <span className="badge">{counts.due + counts.confirm + counts.exceptions}</span>
        </button>
        <button
          className={`nav-item ${view === "search" ? "active" : ""}`}
          onClick={() => setView("search")}
        >
          <IconSearch size={17} />
          Customer search
        </button>
        <button
          className={`nav-item ${view === "admin" ? "active" : ""}`}
          onClick={() => setView("admin")}
        >
          <IconTable size={17} />
          Program admin
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
            currentHistory={currentOnboardingHistory}
            counts={counts}
            customers={state.customers}
            customerQuery={onboardingCustomerQuery}
            customerResults={onboardingCustomerResults}
            currentCustomer={selectedOnboardingCustomer}
            needsFollowUp={onboardingNeedsFollowUp}
            onAddCustomService={addCustomServiceEntry}
            onCriteriaChange={updateCriteriaSelection}
            onCustomerQueryChange={updateOnboardingCustomerQuery}
            recentCustomers={recentOnboardedCustomers}
            saving={savingOnboarding}
            onCustomServiceChange={updateCustomServiceEntry}
            onRemoveCustomService={removeCustomServiceEntry}
            referralProgram={referralProgram}
            form={onboardingForm}
            onSelectCustomer={selectOnboardingCustomer}
            zelleReadyCount={zelleReadyCount}
            onFormChange={updateOnboardingForm}
            onOpenConsole={() => setView("console")}
            onSubmit={submitOnboarding}
            onToggleCriteria={toggleCriteriaSelection}
          />
        )}
        {view === "dashboard" && (
          <DashboardView
            dashboard={state.dashboard}
            needsAttention={needsAttention}
            onOpenOnboarding={() => setView("onboarding")}
            onOpenConsole={() => setView("console")}
          />
        )}
        {view === "console" && (
          <ConsoleView
            counts={counts}
            dueInvoices={state.dueInvoices}
            integrationStatus={state.integrationStatus}
            pendingPayments={state.pendingPayments}
            exceptions={state.exceptions}
            onOpenNewInvoice={openNewInvoice}
            onSendAll={sendAllInvoices}
            onPreviewInvoice={openSendPreview}
            onConfirmPayment={confirmPayment}
            onConfirmAll={confirmAllPayments}
            onSyncInbox={syncInbox}
            onOpenPayment={(payment) => setModal({ type: "payment-review", payload: payment })}
            onOpenMismatch={(exception) => setModal({ type: "mismatch", payload: exception })}
            onOpenAmbiguous={(exception) => setModal({ type: "ambiguous", payload: exception })}
            syncingInbox={syncingInbox}
          />
        )}
        {view === "search" && (
          <SearchView
            customers={state.customers}
            query={searchQuery}
            results={searchResults}
            onQueryChange={setSearchQuery}
            onOpenCustomer={(name) => pushToast(`Customer detail for ${name} coming next`)}
          />
        )}
        {view === "admin" && (
          <AdminView
            referralProgram={referralProgram}
            referralProgramForm={referralProgramForm}
            referrals={state.admin?.referrals ?? []}
            rewards={state.admin?.rewards ?? []}
            saving={savingReferralProgram}
            onFormChange={(field, value) =>
              setReferralProgramForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSave={saveReferralProgram}
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

      <ModalShell show={modal.type === "ambiguous"} onClose={closeModal} size="wide">
        <AmbiguousModal
          exception={modal.payload}
          saveAlias={saveAlias}
          onChangeSaveAlias={setSaveAlias}
          onClose={closeModal}
          onResolve={(candidate) => resolveAmbiguous(modal.payload?.id, candidate)}
        />
      </ModalShell>

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
  customers,
  currentCustomer,
  currentHistory,
  counts,
  customerQuery,
  customerResults,
  form,
  needsFollowUp,
  onAddCustomService,
  onCriteriaChange,
  onCustomerQueryChange,
  onCustomServiceChange,
  onFormChange,
  onOpenConsole,
  onRemoveCustomService,
  onSelectCustomer,
  onSubmit,
  onToggleCriteria,
  referralProgram,
  recentCustomers,
  saving,
  zelleReadyCount,
}) {
  const customerSearchId = useId();
  const referralCustomerOptions = [...customers]
    .filter((customer) => customer.id !== currentCustomer?.id)
    .sort((left, right) => left.name.localeCompare(right.name));
  const selectedCriteriaCodes = new Set(form.criteriaSelections.map((selection) => selection.code));
  const selectedServiceCount = buildOnboardingServiceEntries(form).length;
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
      <div className="content">
        <WorkflowStrip activeStep="onboarding" />

        <div className="metrics c3">
          <MetricCard accent label="Clients onboarded" value={counts.onboarded} />
          <MetricCard label="Zelle match identities captured" value={zelleReadyCount} />
          <MetricCard label="Needs intake follow-up" value={needsFollowUp} />
        </div>

        <div className="two-col onboarding-layout">
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
                <div className="field">
                  <label htmlFor={customerSearchId}>Existing client search</label>
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

                <div className="onboarding-block">
                  <div className="onboarding-block-head">
                    <div>
                      <h3>Services enrolled in this step</h3>
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
                            <div>
                              <div className="cust">{option.label}</div>
                              <div className="sub">
                                {existingEnrollment
                                  ? `Already enrolled on ${formatEnrollmentTimestamp(existingEnrollment.enrolledAt)}`
                                  : "Add this to the member's enrolled services"}
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
                      <h3>Home address</h3>
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
                  <div className="field">
                    <label>Billing cadence</label>
                    <select
                      value={form.billingCadence}
                      onChange={(event) => onFormChange("billingCadence", event.target.value)}
                    >
                      {BILLING_CADENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
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
                        ? `Active rule: ${formatCurrency(referralProgram.bonusAmount)} after ${formatCurrency(
                            referralProgram.qualifyingPaidAmount,
                          )} paid or ${referralProgram.qualificationMonths} months.`
                        : "Referral program is disabled for new enrollments right now."}
                    </div>
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
                    disabled={saving || !hasRequiredFields}
                  >
                    {saving
                      ? "Saving…"
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
                      <div className="cust">{service.name}</div>
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

            <div className="section-gap">
              <div className="section-head">
                <h2>Recent clients</h2>
              </div>
              <div className="section-desc">
                The newest intake records feed customer search, invoice creation, and payment matching.
              </div>
              <div className="tcard">
                {recentCustomers.map((customer) => (
                  <div className="res-row onboarding-result" key={customer.id}>
                    <div className="avatar">{customer.initials}</div>
                    <div className="result-copy">
                      <div className="cust">{customer.name}</div>
                      <div className="sub">
                        Customer ID {formatCustomerReference(customer)} ·{" "}
                        {formatOnboardingStatus(customer.profile.onboardingStatus)} ·{" "}
                        {formatPaymentMethod(customer.profile.preferredPaymentMethod)} ·{" "}
                        {formatBillingCadence(customer.profile.billingCadence)}
                      </div>
                    </div>
                    <div className="result-meta">
                      <div className="sub">{customer.services[0] ?? "Service not set"}</div>
                      <div className="mono">
                        {customer.profile.onboardedAt
                          ? new Date(customer.profile.onboardedAt).toLocaleDateString()
                          : "Pending"}
                      </div>
                    </div>
                  </div>
                ))}
                {!recentCustomers.length && (
                  <div className="empty">
                    <IconUsers size={14} />
                    No onboarded clients yet
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ dashboard, needsAttention, onOpenConsole, onOpenOnboarding }) {
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

        <div className="metrics c4">
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
  exceptions,
  onOpenPayment,
  onOpenNewInvoice,
  onSendAll,
  onPreviewInvoice,
  onConfirmPayment,
  onConfirmAll,
  onSyncInbox,
  onOpenMismatch,
  onOpenAmbiguous,
  syncingInbox,
}) {
  const emailConfigured = integrationStatus?.email?.configured ?? false;
  const gmailConfigured = integrationStatus?.gmail?.configured ?? false;
  const gmailAuthorized = integrationStatus?.gmail?.authorized ?? false;
  const gmailSyncAt = integrationStatus?.gmail?.lastSyncAt;

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
                  <div className="sub">due {formatShortDate(invoice.dueDate)}</div>
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
            Matched against customer records and saved as durable transaction records. Applying also
            sends the receipt to the customer's primary email.
            {gmailSyncAt ? ` Last inbox sync: ${new Date(gmailSyncAt).toLocaleString()}.` : ""}
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
                        : onOpenAmbiguous(exception)
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
      </div>
    </div>
  );
}

function AdminView({
  referralProgram,
  referralProgramForm,
  referrals,
  rewards,
  saving,
  onFormChange,
  onSave,
}) {
  const availableRewards = rewards.filter((reward) => reward.status === "available");
  const awardedRewards = rewards.filter((reward) => reward.status === "applied");

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Program admin</h1>
          <div className="sub">
            Configure the referral rule once and keep each customer referral on its own historical
            snapshot for future product-suite growth.
          </div>
        </div>
      </div>
      <div className="content">
        <div className="metrics c3">
          <MetricCard accent label="Program status" value={referralProgram.enabled ? "Active" : "Disabled"} />
          <MetricCard label="Tracked referrals" value={referrals.length} />
          <MetricCard label="Rewards available" value={availableRewards.length} />
        </div>

        <section className="section">
          <div className="section-head">
            <h2>Referral rule</h2>
            <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
          <div className="section-desc">
            Changes affect new referrals going forward. Existing referral records keep their own
            captured rule snapshot.
          </div>
          <div className="chart-card admin-form-card">
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
                      )} paid or ${referralProgramForm.qualificationMonths || 0} months.`
                    : "Disabled for new referrals."}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Referral relationships</h2>
          </div>
          <div className="section-desc">
            Each relationship snapshots the rule active at the time the referral was recorded.
          </div>
          <div className="tcard">
            <div className="trow head admin-grid">
              <div>Referrer</div>
              <div>Referred client</div>
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
                  {formatCurrency(referral.bonusAmount)} bonus · {formatCurrency(referral.qualifyingPaidAmount)} paid
                  or {referral.qualifyingMonths} months
                </div>
                <div>
                  <span className={`pill ${referral.status === "awarded" ? "" : "warn"}`}>
                    {referral.status}
                  </span>
                </div>
              </div>
            ))}
            {!referrals.length && <div className="empty">No referral relationships recorded yet.</div>}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>Reward ledger</h2>
          </div>
          <div className="section-desc">
            Available rewards can be applied later as credits or tracked across additional products.
          </div>
          <div className="tcard">
            <div className="trow head reward-grid">
              <div>Customer</div>
              <div>Reward</div>
              <div>Status</div>
              <div>Earned</div>
            </div>
            {rewards.map((reward) => (
              <div className="trow reward-grid" key={reward.id}>
                <div>
                  <div className="cust">{reward.customerName}</div>
                  <div className="sub">{reward.customerCode}</div>
                </div>
                <div>
                  <div className="mono">{formatCurrency(reward.amount)}</div>
                  <div className="sub">{reward.description ?? reward.rewardType}</div>
                </div>
                <div>
                  <span className={`pill ${reward.status === "available" ? "warn" : ""}`}>
                    {reward.status}
                  </span>
                </div>
                <div className="sub">
                  {formatDateTimeValue(reward.earnedAt)}
                  {reward.appliedAt ? ` · applied ${formatDateTimeValue(reward.appliedAt)}` : ""}
                </div>
              </div>
            ))}
            {!rewards.length && (
              <div className="empty">
                No rewards earned yet. Bonuses appear here once the configured amount or timing rule is met.
              </div>
            )}
          </div>

          {awardedRewards.length ? (
            <div className="section-desc admin-reward-footnote">
              {awardedRewards.length} reward{awardedRewards.length === 1 ? "" : "s"} already applied.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SearchView({ customers, query, results, onQueryChange, onOpenCustomer }) {
  const showingAll = !query.trim();
  const hint = showingAll
    ? "Showing all customers · type to filter across every field"
    : `${results.length} match${results.length === 1 ? "" : "es"} for "${query.trim().toLowerCase()}"`;

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Customer search</h1>
          <div className="sub">Search by customer ID, name, any email, any phone, alias, or invoice code</div>
        </div>
      </div>
      <div className="content search-content">
        <div className="search-wrap">
          <IconSearch size={18} />
          <input
            className="search-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Try: 4471, sharma, or an email…"
          />
        </div>
        <div className="section-desc">{hint}</div>
        <div className="tcard">
          {!results.length && <div className="empty">No customers match that search</div>}
          {results.map((customer) => {
            const matchLine = buildMatchLine(customer, query, customers);
            return (
              <div className="res-row" key={customer.id}>
                <div className="avatar">{customer.initials}</div>
                <div className="result-copy">
                  <div className="cust">{customer.name}</div>
                  <div
                    className="sub"
                    dangerouslySetInnerHTML={{ __html: matchLine }}
                  />
                  <div className="sub result-profile">
                    Customer ID {formatCustomerReference(customer)} ·{" "}
                    {formatOnboardingStatus(customer.profile?.onboardingStatus)} ·{" "}
                    {formatPaymentMethod(customer.profile?.preferredPaymentMethod)} ·{" "}
                    {formatBillingCadence(customer.profile?.billingCadence)}
                  </div>
                </div>
                <div className="result-meta">
                  <div className="sub">{summarizeContacts(customer)}</div>
                  <button className="btn btn-sm" onClick={() => onOpenCustomer(customer.name)}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
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

  const options = [...customer.services];
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

function formatBillingCadence(value) {
  const labels = {
    per_milestone: "Per milestone",
    monthly: "Monthly cycle",
    custom: "Custom cadence",
  };

  return labels[value] ?? "Cadence pending";
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
            <span className="k">Zelle (5% off)</span>
            <span className="price-accent">{formatCurrency(invoice.zelleAmount)}</span>
          </div>
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
  return (
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
        <div className="detail-label">Raw extracted email text</div>
        <pre className="detail-pre">{rawText || "No email text was extracted."}</pre>
      </div>
    </div>
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
            One click will apply the payment, mark the invoice paid, and email the receipt to the
            primary customer email.
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

function AmbiguousModal({ exception, saveAlias, onChangeSaveAlias, onClose, onResolve }) {
  if (!exception) {
    return null;
  }

  return (
    <>
      <div className="modal-head">
        <h3>
          Resolve: "{exception.senderName}" · {formatCurrency(exception.amount)}
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
        <div className="note warn">
          <IconUsers size={16} />
          <div>
            Name matched two customers and the Zelle email had no phone or email to break the tie.
            Choose the right record, then optionally save the alias for next time.
          </div>
        </div>
        {exception.candidates.map((candidate) => (
          <div className="candidate" key={candidate.customerId}>
            <div className="name">{candidate.name}</div>
            <div className="meta">{candidate.note}</div>
            <button
              className={`btn btn-sm ${candidate.primary ? "btn-primary" : ""}`}
              onClick={() => onResolve(candidate)}
            >
              Match this
            </button>
          </div>
        ))}
        <label className="check-row">
          <input
            type="checkbox"
            checked={saveAlias}
            onChange={(event) => onChangeSaveAlias(event.target.checked)}
          />
          Save this sender as an alias so future payments auto-match
        </label>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Close for later
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
    label: exception.kind === "mismatch" ? "Amount mismatch" : "Ambiguous payer",
    customer: exception.senderName,
    impact:
      exception.kind === "mismatch"
        ? `paid ${formatCurrency(exception.amount)} / exp ${formatCurrency(exception.expectedAmount)}`
        : "2 customers match",
    action: exception.kind === "mismatch" ? "Review" : "Resolve",
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
