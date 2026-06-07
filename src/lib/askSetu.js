import { formatCurrency, formatLongDate } from "./finance.js";

export const ASK_SETU_SUGGESTIONS = [
  "How many payments need review right now?",
  "Who has due invoices today?",
  "Show contracts signed with Lohith Deshpande",
  "How many employees are active?",
  "Summarize payables by region",
  "Summarize Karthik Pamaraju",
  "What happened in the latest Gmail sync?",
  "Is outbound email ready?",
  "What referral program is active?",
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9@.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = String(value).includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTimeValue(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function sortByMostRecent(values, selector) {
  return [...values].sort((left, right) => {
    const leftDate = parseDateValue(selector(left))?.getTime() ?? 0;
    const rightDate = parseDateValue(selector(right))?.getTime() ?? 0;
    return rightDate - leftDate;
  });
}

function findCustomerMatches(customers, query) {
  const normalized = normalizeText(query);
  const digitQuery = normalizeDigits(query);

  return customers.filter((customer) => {
    const customerName = normalizeText(customer.name);
    if (customerName.includes(normalized) || normalized.includes(customerName)) {
      return true;
    }

    const customerCode = String(customer.customerCode || "").toLowerCase();
    if (customerCode.includes(normalized) || normalized.includes(customerCode)) {
      return true;
    }

    if (
      customer.emails.some((email) => {
        const emailValue = normalizeText(email.value);
        return emailValue.includes(normalized) || normalized.includes(emailValue);
      })
    ) {
      return true;
    }

    if (
      digitQuery &&
      customer.phones.some((phone) => {
        const phoneDigits = normalizeDigits(phone.value);
        return phoneDigits.includes(digitQuery) || digitQuery.includes(phoneDigits);
      })
    ) {
      return true;
    }

    return customer.aliases.some((alias) => {
      const aliasName = normalizeText(alias.name);
      const aliasEmail = normalizeText(alias.email);
      const aliasPhone = normalizeDigits(alias.phoneLast4);
      return (
        (aliasName && (aliasName.includes(normalized) || normalized.includes(aliasName))) ||
        (aliasEmail && (aliasEmail.includes(normalized) || normalized.includes(aliasEmail))) ||
        (digitQuery && aliasPhone && (aliasPhone.includes(digitQuery) || digitQuery.includes(aliasPhone)))
      );
    });
  });
}

function findInvoiceMatch(invoices, query) {
  const digitQuery = normalizeDigits(query);
  if (!digitQuery) {
    return null;
  }
  return invoices.find((invoice) => normalizeDigits(invoice.invoiceCode).includes(digitQuery));
}

function findPaymentMatch(payments, query) {
  const digitQuery = normalizeDigits(query);
  if (!digitQuery) {
    return null;
  }
  return payments.find((payment) => normalizeDigits(payment.transactionReference).includes(digitQuery));
}

function findEmployeeMatches(employees, query) {
  const normalized = normalizeText(query);
  const digitQuery = normalizeDigits(query);

  return employees.filter((employee) => {
    const haystack = [
      employee.employeeCode,
      employee.firstName,
      employee.middleName,
      employee.lastName,
      employee.fullName,
      employee.officialEmail,
      employee.personalEmail,
      employee.officialMobile,
      employee.personalMobile,
      employee.department,
      employee.title,
      employee.region,
      employee.status,
    ]
      .filter(Boolean)
      .join(" ");
    const normalizedHaystack = normalizeText(haystack);
    const digitHaystack = normalizeDigits(haystack);
    return (
      normalizedHaystack.includes(normalized) ||
      normalized.includes(normalizedHaystack) ||
      (digitQuery && digitHaystack.includes(digitQuery))
    );
  });
}

function findContractMatches(contracts, query) {
  const normalized = normalizeText(query);
  const stopWords = new Set([
    "show",
    "contract",
    "contracts",
    "signed",
    "with",
    "for",
    "the",
    "client",
    "employee",
    "agreement",
    "agreements",
    "list",
  ]);
  const queryTokens = normalized
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));

  return contracts.filter((contract) => {
    const haystack = [
      contract.fileName,
      contract.ownerCategory,
      contract.ownerCode,
      contract.ownerName,
      contract.signedWithName,
      contract.contractType,
      contract.contractTypeLabel,
      contract.summary,
      contract.notes,
      contract.signedDate,
      contract.contractDate,
    ]
      .filter(Boolean)
      .join(" ");
    const normalizedHaystack = normalizeText(haystack);
    if (normalizedHaystack.includes(normalized) || normalized.includes(normalizedHaystack)) {
      return true;
    }
    return queryTokens.length > 0 && queryTokens.every((token) => normalizedHaystack.includes(token));
  });
}

function listNames(items, fallbackField = "customerName") {
  return items
    .map((item) => item[fallbackField] || item.senderName || item.name)
    .filter(Boolean)
    .join(", ");
}

function buildCustomerAnswer(customer, state) {
  const customerInvoices = state.invoices.filter((invoice) => invoice.customerId === customer.id);
  const dueInvoices = customerInvoices.filter((invoice) => ["draft", "sent", "overdue"].includes(invoice.status));
  const confirmedPayments = state.payments.filter(
    (payment) => payment.customerId === customer.id && payment.reviewStatus === "confirmed",
  );
  const pendingPayments = state.pendingPayments.filter((payment) => payment.customerId === customer.id);
  const exceptions = state.exceptions.filter(
    (exception) => exception.customerId === customer.id || normalizeText(exception.senderName) === normalizeText(customer.name),
  );
  const referredBy = state.admin?.referrals?.find((referral) => referral.referredCustomerId === customer.id) ?? null;
  const referralsMade = state.admin?.referrals?.filter((referral) => referral.referrerCustomerId === customer.id) ?? [];
  const latestPayment = sortByMostRecent(confirmedPayments, (payment) => payment.appliedAt || payment.receivedAt)[0];
  const onboardingDate = customer.profile?.onboardedAt ? formatLongDate(customer.profile.onboardedAt) : "not captured";
  const services = customer.services.length ? customer.services.join(", ") : "no services recorded yet";
  const dueSummary = dueInvoices.length
    ? `${formatCountLabel(dueInvoices.length, "open invoice")} totaling ${formatCurrency(
        dueInvoices.reduce((sum, invoice) => sum + Number(invoice.zelleAmount || 0), 0),
      )}`
    : "no open invoices";
  const pendingSummary = pendingPayments.length
    ? `${formatCountLabel(pendingPayments.length, "pending payment review")} totaling ${formatCurrency(
        pendingPayments.reduce((sum, payment) => sum + Number(payment.amountReceived || 0), 0),
      )}`
    : "no pending payments";
  const latestPaymentSummary = latestPayment
    ? `Latest confirmed payment was ${formatCurrency(latestPayment.amountReceived)} on ${formatDateTimeValue(
        latestPayment.appliedAt || latestPayment.receivedAt,
      )}.`
    : "No confirmed payments have been applied yet.";

  return `${customer.name} (${customer.customerCode}) signed up on ${onboardingDate}. Services: ${services}. Finance status: ${dueSummary}; ${pendingSummary}; ${formatCountLabel(exceptions.length, "open exception")}. ${latestPaymentSummary}${
    referredBy ? ` Referred by ${referredBy.referrerCustomerName}.` : ""
  }${referralsMade.length ? ` They have referred ${formatCountLabel(referralsMade.length, "client")}.` : ""}`;
}

function answerCounts(question, state) {
  const normalized = normalizeText(question);

  if (normalized.includes("payment") && (normalized.includes("review") || normalized.includes("confirm") || normalized.includes("pending"))) {
    const pending = state.pendingPayments;
    const total = pending.reduce((sum, payment) => sum + Number(payment.amountReceived || 0), 0);
    return `There are ${formatCountLabel(pending.length, "payment")} waiting in Payments to confirm, totaling ${formatCurrency(total)}.`;
  }

  if (normalized.includes("exception")) {
    const exceptions = state.exceptions;
    if (!exceptions.length) {
      return "There are no open exceptions right now.";
    }

    return `There are ${formatCountLabel(exceptions.length, "open exception")}. Current senders: ${listNames(
      exceptions.slice(0, 5),
      "senderName",
    )}.`;
  }

  if (normalized.includes("invoice") && (normalized.includes("due") || normalized.includes("open"))) {
    const due = state.dueInvoices;
    const total = due.reduce((sum, invoice) => sum + Number(invoice.zelleAmount || 0), 0);
    return due.length
      ? `There are ${formatCountLabel(due.length, "invoice")} in the due-to-send queue totaling ${formatCurrency(
          total,
        )}. Top customers: ${listNames(due.slice(0, 3))}.`
      : "There are no invoices waiting in the due-to-send queue.";
  }

  if ((normalized.includes("customer") || normalized.includes("client")) && normalized.includes("how many")) {
    return `The portal currently has ${formatCountLabel(state.customers.length, "customer")} onboarded.`;
  }

  return null;
}

function answerSyncStatus(state) {
  const gmail = state.integrationStatus?.gmail;
  if (!gmail?.configured || !gmail?.authorized) {
    return "Gmail sync is not fully configured yet.";
  }

  const lastSync = gmail.lastSyncAt ? formatDateTimeValue(gmail.lastSyncAt) : "not run yet";
  const autoSync = gmail.autoSync?.active
    ? ` Automatic sync is active every ${gmail.autoSync.intervalMinutes || 5} minutes.`
    : " Automatic sync is not active.";
  const summary = gmail.lastSyncSummary;
  if (!summary) {
    return `Gmail sync is authorized and ready. Last sync: ${lastSync}.${autoSync}`;
  }

  return `Gmail sync is healthy. Last sync ran ${lastSync} in ${gmail.syncMode} mode and processed ${summary.processedCount || 0} messages, adding ${summary.pendingAdded || 0} pending payments and ${summary.exceptionsAdded || 0} exceptions.${autoSync}`;
}

function answerEmailStatus(state) {
  const email = state.integrationStatus?.email;
  if (!email?.configured) {
    return "Outbound email is not configured yet.";
  }

  return `Outbound email is ready and sending from ${email.from}.`;
}

function answerReferralStatus(state) {
  const program = state.admin?.referralProgram;
  if (!program) {
    return "Referral program details are not available in the current state.";
  }

  const activeReferrals = (state.admin?.referrals ?? []).filter((referral) => referral.status !== "awarded");
  const rewards = state.admin?.rewards ?? [];
  return `Referral program is ${program.enabled ? "enabled" : "disabled"}. Current rule: ${formatCurrency(
    program.bonusAmount,
  )} bonus after ${formatCurrency(program.qualifyingPaidAmount)} in payments or ${program.qualificationMonths} months, whichever comes first. There are ${formatCountLabel(
    activeReferrals.length,
    "active referral",
  )} and ${formatCountLabel(rewards.length, "reward")} on the ledger.`;
}

function answerPeopleStatus(question, state) {
  const normalized = normalizeText(question);
  const employees = state.admin?.employees ?? [];
  const employeePayments = state.admin?.employeePayments ?? [];
  const payslips = state.admin?.employeePayslips ?? [];
  const currentEmployees = employees.filter((employee) => employee.status === "current");
  const formerEmployees = employees.filter((employee) => ["terminated", "left_company"].includes(employee.status));

  if (normalized.includes("payslip")) {
    return `There are ${formatCountLabel(payslips.length, "generated payslip")} in employee records. Open People, search the employee, then use Employee 360 to generate or download payslips.`;
  }

  if (normalized.includes("payment") || normalized.includes("paid") || normalized.includes("salary")) {
    const paidTotal = employeePayments
      .filter((payment) => payment.status !== "cancelled")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return `Employee ledger has ${formatCountLabel(employeePayments.length, "payment record")} totaling ${formatCurrency(
      paidTotal,
    )} excluding cancelled records.`;
  }

  return `People has ${formatCountLabel(employees.length, "employee")} total: ${formatCountLabel(
    currentEmployees.length,
    "current employee",
  )} and ${formatCountLabel(formerEmployees.length, "former employee")}. The directory is search-first and shows only the top 10 matches.`;
}

function answerPayablesStatus(state) {
  const employeePayments = state.admin?.employeePayments ?? [];
  const referralPayouts = state.admin?.referralPayouts ?? [];
  const otherExpenses = state.admin?.otherExpenses ?? [];
  const employeePaid = employeePayments
    .filter((payment) => payment.status !== "cancelled")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const otherPaid = otherExpenses
    .filter((entry) => entry.direction === "paid" || entry.expenseDirection === "paid")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const otherReceived = otherExpenses
    .filter((entry) => entry.direction === "received" || entry.expenseDirection === "received")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return `Payables shows ${formatCurrency(employeePaid)} in employee payments, ${formatCountLabel(
    referralPayouts.length,
    "referral payout",
  )}, ${formatCurrency(otherPaid)} in other paid expenses, and ${formatCurrency(otherReceived)} in other received income/refunds.`;
}

function answerContractStatus(question, state) {
  const contracts = state.admin?.contractLibrary ?? [];
  if (!contracts.length) {
    return "No contracts are saved in the contract library yet.";
  }

  const normalized = normalizeText(question);
  const clientCount = contracts.filter((contract) => contract.ownerCategory === "client").length;
  const employeeCount = contracts.filter((contract) => contract.ownerCategory === "employee").length;
  const matches = findContractMatches(contracts, question);

  if (
    matches.length &&
    (normalized.includes("with") ||
      normalized.includes("signed") ||
      normalized.includes("lohith") ||
      normalized.includes("employee") ||
      normalized.includes("client") ||
      normalized.includes("nda") ||
      normalized.includes("offer"))
  ) {
    return matches
      .slice(0, 5)
      .map((contract) => {
        const signedDate = contract.signedDate ? formatLongDate(contract.signedDate) : "signed date not captured";
        return `${contract.fileName}: ${contract.contractTypeLabel} signed with ${
          contract.signedWithName || contract.ownerName
        } on ${signedDate}. Summary: ${contract.summary || "summary not captured"}.`;
      })
      .join(" ");
  }

  return `Contracts has ${formatCountLabel(contracts.length, "contract")} total: ${clientCount} client, ${employeeCount} employee, and ${
    contracts.length - clientCount - employeeCount
  } stakeholder/other. Use Contracts to search, Quick peek, or download raw files.`;
}

function answerLatestActivity(state) {
  const activity = state.activity?.slice(0, 4) ?? [];
  if (!activity.length) {
    return "No recent activity is recorded yet.";
  }

  return `Latest activity: ${activity.map((item) => item.label).join(" • ")}.`;
}

function answerInvoiceQuestion(invoice) {
  const statusLabel = invoice.status ?? "queued to send";
  return `Invoice ${invoice.invoiceCode} for ${invoice.customerName} is ${statusLabel}. Amount due by Zelle is ${formatCurrency(
    invoice.zelleAmount,
  )} and the due date is ${formatLongDate(invoice.dueDate)}.`;
}

function answerPaymentQuestion(payment) {
  const statusLabel =
    payment.reviewStatus === "confirmed"
      ? `confirmed on ${formatDateTimeValue(payment.appliedAt)}`
      : payment.reviewStatus === "pending"
        ? "waiting in Payments to confirm"
        : payment.reviewStatus === "exception"
          ? "currently in exceptions"
          : payment.reviewStatus;

  return `Transaction ${payment.transactionReference} for ${formatCurrency(payment.amountReceived)} from ${
    payment.customerName || payment.senderNameRaw || "the sender"
  } is ${statusLabel}.`;
}

export function buildAskSetuAnswer(question, state) {
  const trimmed = String(question || "").trim();
  if (!trimmed) {
    return "Ask me about payments to confirm, due invoices, customer status, contracts, employees, payables, Gmail sync, outbound email, referrals, or recent activity.";
  }

  const normalized = normalizeText(trimmed);
  const countAnswer = answerCounts(trimmed, state);
  if (countAnswer) {
    return countAnswer;
  }

  if (normalized.includes("gmail") || normalized.includes("sync") || normalized.includes("zelle inbox")) {
    return answerSyncStatus(state);
  }

  if (normalized.includes("outbound") || normalized.includes("email ready") || normalized.includes("send receipt") || normalized.includes("receipt email")) {
    return answerEmailStatus(state);
  }

  if (normalized.includes("contract") || normalized.includes("agreement") || normalized.includes("nda") || normalized.includes("offer letter")) {
    return answerContractStatus(trimmed, state);
  }

  if (normalized.includes("employee") || normalized.includes("people") || normalized.includes("payslip") || normalized.includes("salary")) {
    const employeeMatches = findEmployeeMatches(state.admin?.employees ?? [], trimmed);
    if (employeeMatches.length === 1 && !normalized.includes("how many")) {
      const employee = employeeMatches[0];
      const payments = (state.admin?.employeePayments ?? []).filter((payment) => payment.employeeId === employee.id);
      const paidTotal = payments
        .filter((payment) => payment.status !== "cancelled")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return `${employee.fullName} (${employee.employeeCode}) is ${employee.status} in ${employee.department} as ${employee.title}. Region: ${employee.region}. Recorded employee payments: ${formatCountLabel(
        payments.length,
        "payment",
      )} totaling ${formatCurrency(paidTotal)}.`;
    }
    return answerPeopleStatus(trimmed, state);
  }

  if (normalized.includes("payable") || normalized.includes("expense") || normalized.includes("money out")) {
    return answerPayablesStatus(state);
  }

  if (normalized.includes("referral")) {
    return answerReferralStatus(state);
  }

  if (normalized.includes("latest") || normalized.includes("recent activity") || normalized.includes("what changed")) {
    return answerLatestActivity(state);
  }

  const invoiceMatch = findInvoiceMatch([...state.dueInvoices, ...state.invoices], trimmed);
  if (invoiceMatch) {
    return answerInvoiceQuestion(invoiceMatch);
  }

  const paymentMatch = findPaymentMatch(state.payments, trimmed);
  if (paymentMatch) {
    return answerPaymentQuestion(paymentMatch);
  }

  const customerMatches = findCustomerMatches(state.customers, trimmed);
  if (customerMatches.length === 1) {
    return buildCustomerAnswer(customerMatches[0], state);
  }

  if (customerMatches.length > 1) {
    return `I found multiple customer matches: ${customerMatches
      .slice(0, 5)
      .map((customer) => `${customer.name} (${customer.customerCode})`)
      .join(", ")}. Try a fuller name, email, phone, or customer ID.`;
  }

  if (normalized.includes("what can you do") || normalized === "help" || normalized.includes("anything")) {
    return "I can answer quick questions from the current portal state: customer summaries, due invoices, pending payments, exception counts, contracts and signed-with details, employee records, payables, Gmail sync health, outbound email status, referral rules, and invoice or transaction lookups by number.";
  }

  return "I couldn’t answer that directly from the current portal state yet. Try asking about a customer, employee, contract, invoice number, transaction number, due invoices, pending payments, Gmail sync, outbound email, payables, or referrals.";
}
