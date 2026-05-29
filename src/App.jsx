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
  service: "Authorship",
  milestone: "",
  amount: 1500,
  discountPct: 5,
  dueDate: "2026-06-10",
};

const DEFAULT_SERVICE_OPTIONS = [
  "Authorship",
  "Judging",
  "Media package",
  "Full profile",
  "Custom",
];

const DEFAULT_AUTH_FORM = {
  username: "admin",
  password: "",
};

function App() {
  const [view, setView] = useState("dashboard");
  const [state, setState] = useState(createInitialState);
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState({ type: null, payload: null });
  const [invoiceForm, setInvoiceForm] = useState(DEFAULT_FORM);
  const [invoiceCustomerQuery, setInvoiceCustomerQuery] = useState("");
  const [saveAlias, setSaveAlias] = useState(true);
  const [syncingInbox, setSyncingInbox] = useState(false);
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

  useEffect(() => {
    if (modal.type !== "ambiguous") {
      setSaveAlias(true);
    }
  }, [modal.type]);

  function resetPortalUi() {
    setView("dashboard");
    setState(createInitialState());
    setSearchQuery("");
    setModal({ type: null, payload: null });
    setInvoiceForm({ ...DEFAULT_FORM });
    setInvoiceCustomerQuery("");
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

  async function resolveMismatch(actionType, toastLabel) {
    try {
      const data = await apiRequest("/api/exceptions/exc-rahul/resolve", {
        method: "POST",
        body: { actionType },
      });
      setState(data.state);
      closeModal();
      pushToast(toastLabel);
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      pushToast(error.message);
    }
  }

  async function resolveAmbiguous(candidate) {
    try {
      const data = await apiRequest("/api/exceptions/exc-sharma/resolve", {
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

  function updateForm(field, value) {
    setInvoiceForm((current) => ({
      ...current,
      [field]: value,
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
        {view === "dashboard" && (
          <DashboardView
            dashboard={state.dashboard}
            needsAttention={needsAttention}
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
            onOpenMismatch={() => setModal({ type: "mismatch", payload: null })}
            onOpenAmbiguous={() => setModal({ type: "ambiguous", payload: null })}
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
          serviceOptions={serviceOptions}
          zelleAmount={zellePreview}
        />
      </ModalShell>

      <ModalShell show={modal.type === "send-preview"} onClose={closeModal}>
        <SendPreviewModal invoice={modal.payload} onClose={closeModal} onSend={sendInvoice} />
      </ModalShell>

      <ModalShell show={modal.type === "mismatch"} onClose={closeModal}>
        <MismatchModal
          exception={state.exceptions.find((item) => item.id === "exc-rahul")}
          onAccept={() => resolveMismatch("accept_full", "Accepted as full payment")}
          onCredit={() => resolveMismatch("apply_credit", "$90 applied as credit")}
          onClose={closeModal}
        />
      </ModalShell>

      <ModalShell show={modal.type === "ambiguous"} onClose={closeModal}>
        <AmbiguousModal
          exception={state.exceptions.find((item) => item.id === "exc-sharma")}
          saveAlias={saveAlias}
          onChangeSaveAlias={setSaveAlias}
          onClose={closeModal}
          onResolve={resolveAmbiguous}
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

function DashboardView({ dashboard, needsAttention, onOpenConsole }) {
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
            <button className="btn btn-sm btn-ghost" onClick={onOpenConsole}>
              Open console <IconArrowRight size={14} />
            </button>
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
                  <div className="sub">{invoice.email}</div>
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
              Confirm all high-confidence
            </button>
          </div>
          <div className="section-desc">
            Matched against customer records. Confirming also sends the receipt.
            {gmailSyncAt ? ` Last inbox sync: ${new Date(gmailSyncAt).toLocaleString()}.` : ""}
          </div>
          <div className="tcard">
            <div className="trow head confirm-grid">
              <div>Customer</div>
              <div>Signals matched</div>
              <div>Score</div>
              <div>Paid</div>
              <div />
            </div>
            {pendingPayments.map((payment) => (
              <div className="trow confirm-grid" key={payment.id}>
                <div className="cust">{payment.customerName}</div>
                <div className="signals">
                  <span className="ok">
                    <IconCheck size={13} />
                    {payment.matchedSignals.join(" · ")}
                  </span>
                </div>
                <div>
                  <span className="score hi">{payment.score}</span>
                </div>
                <div className="mono">{formatCurrency(payment.amountReceived)}</div>
                <div>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onConfirmPayment(payment.id)}
                  >
                    Confirm
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
              <div>Sender / amount</div>
              <div>Reason</div>
              <div>Date</div>
              <div />
            </div>
            {exceptions.map((exception) => (
              <div className="trow exception-grid attn" key={exception.id}>
                <div>
                  <div className="cust">{exception.senderName}</div>
                  <div className="sub mono">{formatCurrency(exception.amount)}</div>
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
                      2 customers match name
                    </span>
                  )}
                </div>
                <div className="sub">{exception.dateLabel}</div>
                <div>
                  <button
                    className="btn btn-sm"
                    onClick={exception.kind === "mismatch" ? onOpenMismatch : onOpenAmbiguous}
                  >
                    {exception.kind === "mismatch" ? "Review" : "Resolve"}
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
          <div className="sub">Search by name, any email, any phone, alias, or invoice code</div>
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

function ModalShell({ children, onClose, show }) {
  if (!show) {
    return null;
  }

  return (
    <div className="modal-back show" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
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
                    Autofilled from record · {summarizeContacts(selectedCustomer)} ·{" "}
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
                          {describeCustomerMatch(customer)} · {summarizeContacts(customer)}
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
    email: `Matched email ${customer.matchValue}`,
    phone: `Matched phone ${customer.matchValue}`,
    alias: `Matched alias ${customer.matchValue}`,
    invoice: `Matched invoice ${customer.matchValue}`,
  };

  return labels[customer.matchField] ?? "Existing customer";
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
              <span className="mono warn-text">+{formatCurrency(difference)}</span>
            </div>
          </div>
        </div>
        <div className="note warn">
          <IconAlertTriangle size={16} />
          <div>
            Name and phone matched, but the customer paid the full amount instead of the stored
            Zelle rate. Per Phase 1 rules, this always needs a human decision.
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onAccept}>
          Accept as full payment
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
          None of these — assign manually
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
    email: "matched email",
    phone: "matched phone",
    alias: "matched payment alias",
    invoice: "matched invoice",
  };

  return `${labels[customer.matchField]} ${highlightMatch(customer.matchValue, query)}`;
}

export default App;
