const CUSTOMER_CODE_BASE = 100000;
const INVOICE_CODE_BASE = 500000;
const LEGACY_CUSTOMER_CODE_BASE = 1000000000;
const LEGACY_INVOICE_CODE_BASE = 7000000000;

function makeFixedLengthNumericCode(base, sequence, width) {
  const numeric = Number(base) + Number(sequence || 0);
  return String(numeric).padStart(width, "0");
}

function extractTrailingDigits(value) {
  const match = String(value || "").trim().match(/(\d+)(?!.*\d)/);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function extractCustomerSequence(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{6}$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric - CUSTOMER_CODE_BASE : null;
  }

  if (/^\d{10}$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric - LEGACY_CUSTOMER_CODE_BASE : null;
  }

  return extractTrailingDigits(raw);
}

export function extractInvoiceSequence(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{6}$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric - INVOICE_CODE_BASE : null;
  }

  if (/^\d{10}$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric - LEGACY_INVOICE_CODE_BASE : null;
  }

  return extractTrailingDigits(raw);
}

export function makeCustomerCode(sequence) {
  return makeFixedLengthNumericCode(CUSTOMER_CODE_BASE, sequence, 6);
}

function makeInvoiceCode(sequence) {
  return makeFixedLengthNumericCode(INVOICE_CODE_BASE, sequence, 6);
}

export function normalizeCustomerCode(value, fallbackSequence = null) {
  const raw = String(value || "").trim();
  if (/^\d{6}$/.test(raw)) {
    return raw;
  }

  const sequence = extractCustomerSequence(raw) ?? fallbackSequence;
  return Number.isFinite(sequence) && sequence > 0 ? makeCustomerCode(sequence) : null;
}

export function normalizeInvoiceCode(value, fallbackSequence = null) {
  const raw = String(value || "").trim();
  if (/^\d{6}$/.test(raw)) {
    return raw;
  }

  const sequence = extractInvoiceSequence(raw) ?? fallbackSequence;
  return Number.isFinite(sequence) && sequence > 0 ? makeInvoiceCode(sequence) : null;
}

function replaceIdentifierText(text, replacements) {
  if (!text) {
    return text;
  }

  return replacements.reduce((result, [from, to]) => {
    if (!from || !to || from === to) {
      return result;
    }

    return result.split(from).join(to);
  }, String(text));
}

function dedupeRecordsById(records = [], excludedIds = new Set()) {
  const seen = new Set(excludedIds);

  return records.filter((record) => {
    const id = record?.id;
    if (!id) {
      return true;
    }

    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function buildServiceHistory(seedPrefix, services, startedAt) {
  return services.map((service, index) => ({
    id: `seed-${seedPrefix}-${String(service).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`,
    name: service,
    code: null,
    isCustom: false,
    enrolledAt: new Date(new Date(startedAt).getTime() + index * 36e5).toISOString(),
  }));
}

function buildAddress(addressLine1, city, state, postalCode) {
  return {
    homeAddressLine1: addressLine1,
    homeAddressLine2: null,
    homeCity: city,
    homeState: state,
    homePostalCode: postalCode,
    homeCountry: "USA",
  };
}

const seedCustomers = [
  {
    id: "rohan-sharma",
    customerCode: "CUS-00001",
    initials: "RS",
    name: "Rohan Sharma",
    services: ["Authorship", "Judging"],
    emails: [
      { value: "rohan.sharma@gmail.com", label: "personal", isPrimary: true },
      { value: "r.sharma@workcorp.com", label: "work", isPrimary: false },
    ],
    phones: [
      { value: "(847) 555-4471", label: "mobile", isPrimary: true },
      { value: "(847) 555-9920", label: "other", isPrimary: false },
      { value: "(312) 555-2210", label: "family", isPrimary: false },
    ],
    aliases: [
      { name: "Meena Sharma", relation: "spouse", email: null, phoneLast4: null },
      { name: "Rohan S", relation: "zelle identity", email: "rohan.sharma@gmail.com", phoneLast4: "4471" },
    ],
    invoices: ["ASC-2026-0042"],
    serviceHistory: buildServiceHistory("rohan-sharma", ["Authorship", "Judging"], "2026-05-02T15:00:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "zelle",
      feeType: "one_time",
      billingCadence: "per_milestone",
      referralSource: "Referral",
      referredByCustomerId: null,
      billingNotes: "Prefers invoice reminders by email the night before due date.",
      onboardedAt: "2026-05-02T15:00:00.000Z",
      ...buildAddress("1827 West Chase Avenue", "Chicago", "IL", "60626"),
    },
  },
  {
    id: "anjali-mehta",
    customerCode: "CUS-00002",
    initials: "AM",
    name: "Anjali Mehta",
    services: ["Authorship"],
    emails: [{ value: "anjali.mehta@email.com", label: "personal", isPrimary: true }],
    phones: [
      { value: "(630) 555-1180", label: "mobile", isPrimary: true },
      { value: "(630) 555-4471", label: "other", isPrimary: false },
    ],
    aliases: [],
    invoices: ["ASC-2026-0086", "ASC-2026-0087"],
    serviceHistory: buildServiceHistory("anjali-mehta", ["Authorship"], "2026-05-05T18:30:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "both",
      feeType: "recurring",
      billingCadence: "monthly",
      referralSource: "Direct",
      referredByCustomerId: null,
      billingNotes: "Keeps one open monthly billing cycle when multiple authorship milestones overlap.",
      onboardedAt: "2026-05-05T18:30:00.000Z",
      ...buildAddress("740 Ridgeview Court", "Naperville", "IL", "60540"),
    },
  },
  {
    id: "vikram-patel",
    customerCode: "CUS-00003",
    initials: "VP",
    name: "Vikram Patel",
    services: ["Full profile", "Media package"],
    emails: [
      { value: "v.patel@email.com", label: "personal", isPrimary: true },
      { value: "vikram@startup.io", label: "work", isPrimary: false },
      { value: "vp@personal.com", label: "other", isPrimary: false },
    ],
    phones: [{ value: "(312) 555-7788", label: "mobile", isPrimary: true }],
    aliases: [
      { name: "Vikram P", relation: "zelle identity", email: "v.patel@email.com", phoneLast4: "7788" },
    ],
    invoices: ["ASC-2026-0090", "ASC-2026-4471"],
    serviceHistory: buildServiceHistory("vikram-patel", ["Full profile", "Media package"], "2026-05-09T12:15:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "zelle",
      feeType: "one_time",
      billingCadence: "per_milestone",
      referralSource: "Partner intro",
      referredByCustomerId: null,
      billingNotes: "Uses Zelle for milestone releases and occasionally pays final balance by card.",
      onboardedAt: "2026-05-09T12:15:00.000Z",
      ...buildAddress("1124 North Halsted Street", "Chicago", "IL", "60642"),
    },
  },
  {
    id: "priya-sharma",
    customerCode: "CUS-00004",
    initials: "PS",
    name: "Priya Sharma",
    services: ["Media package"],
    emails: [{ value: "priya.s@email.com", label: "personal", isPrimary: true }],
    phones: [{ value: "(312) 555-2210", label: "mobile", isPrimary: true }],
    aliases: [],
    invoices: ["ASC-2026-0061"],
    serviceHistory: buildServiceHistory("priya-sharma", ["Media package"], "2026-05-12T16:45:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "zelle",
      feeType: "one_time",
      billingCadence: "per_milestone",
      referralSource: "Referral",
      referredByCustomerId: "rohan-sharma",
      billingNotes: "Needs phone call follow-up only if payment is late by more than 7 days.",
      onboardedAt: "2026-05-12T16:45:00.000Z",
      ...buildAddress("901 West Randolph Street", "Chicago", "IL", "60607"),
    },
  },
  {
    id: "suresh-iyer",
    customerCode: "CUS-00005",
    initials: "SI",
    name: "Suresh Iyer",
    services: ["Judging"],
    emails: [{ value: "s.iyer@email.com", label: "personal", isPrimary: true }],
    phones: [{ value: "(224) 555-3300", label: "mobile", isPrimary: true }],
    aliases: [],
    invoices: ["ASC-2026-0078"],
    serviceHistory: buildServiceHistory("rahul-gupta", ["Judging"], "2026-05-15T13:10:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "card",
      feeType: "one_time",
      billingCadence: "custom",
      referralSource: "Returning client",
      referredByCustomerId: null,
      billingNotes: "Usually requests a card link for approval workflows through work.",
      onboardedAt: "2026-05-15T13:10:00.000Z",
      ...buildAddress("68 East Cedar Street", "Chicago", "IL", "60611"),
    },
  },
  {
    id: "karthik-nair",
    customerCode: "CUS-00006",
    initials: "KN",
    name: "Karthik Nair",
    services: ["Full profile"],
    emails: [{ value: "k.nair@email.com", label: "personal", isPrimary: true }],
    phones: [{ value: "(847) 555-6610", label: "mobile", isPrimary: true }],
    aliases: [],
    invoices: ["ASC-2026-0033"],
    serviceHistory: buildServiceHistory("sana-khan", ["Full profile"], "2026-05-19T11:05:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "both",
      feeType: "one_time",
      billingCadence: "per_milestone",
      referralSource: "Website",
      referredByCustomerId: null,
      billingNotes: "Needs short receipt note included for reimbursement paperwork.",
      onboardedAt: "2026-05-19T11:05:00.000Z",
      ...buildAddress("441 Sheridan Road", "Evanston", "IL", "60202"),
    },
  },
  {
    id: "rahul-kapoor",
    customerCode: "CUS-00007",
    initials: "RK",
    name: "Rahul Kapoor",
    services: ["Judging"],
    emails: [{ value: "r.kapoor@email.com", label: "personal", isPrimary: true }],
    phones: [{ value: "(847) 555-3092", label: "mobile", isPrimary: true }],
    aliases: [],
    invoices: ["ASC-2026-0058"],
    serviceHistory: buildServiceHistory("amit-sharma", ["Judging"], "2026-05-23T17:20:00.000Z"),
    profile: {
      onboardingStatus: "complete",
      intakeSource: "seed",
      preferredPaymentMethod: "zelle",
      feeType: "one_time",
      billingCadence: "per_milestone",
      referralSource: "Direct",
      referredByCustomerId: null,
      billingNotes: "Asks for milestone references in subject lines for every invoice and receipt.",
      onboardedAt: "2026-05-23T17:20:00.000Z",
      ...buildAddress("1330 Maple Avenue", "Evanston", "IL", "60201"),
    },
  },
];

const seedDashboard = {
  dateLabel: "Thursday, May 28, 2026",
  periodLabel: "May 2026",
  metrics: {
    collected: 28400,
    outstanding: 42800,
    expected: 51200,
    autoMatchRate: "91%",
    avgDaysToPay: "4.2",
    activeCustomers: 37,
    manualHoursSaved: "~14h",
  },
  aging: [
    { label: "Current", amount: 27400, width: 64, tone: "success" },
    { label: "1-15 days", amount: 10200, width: 24, tone: "ink" },
    { label: "16-30 days", amount: 3800, width: 9, tone: "amber" },
    { label: "30+ days", amount: 1400, width: 3, tone: "danger" },
  ],
  chartData: [
    { month: "Dec", zelle: 18, stripe: 5 },
    { month: "Jan", zelle: 21, stripe: 4 },
    { month: "Feb", zelle: 19, stripe: 7 },
    { month: "Mar", zelle: 24, stripe: 6 },
    { month: "Apr", zelle: 22, stripe: 5 },
    { month: "May", zelle: 24, stripe: 4 },
  ],
};

const seedDueInvoices = [
  {
    id: "due-anjali",
    customerId: "anjali-mehta",
    customerName: "Anjali Mehta",
    email: "anjali.mehta@email.com",
    service: "Authorship",
    milestone: "M2",
    dueDate: "2026-05-28",
    zelleAmount: 1425,
    cardAmount: 1500,
    invoiceCode: "ASC-2026-0087",
  },
  {
    id: "due-suresh",
    customerId: "suresh-iyer",
    customerName: "Suresh Iyer",
    email: "s.iyer@email.com",
    service: "Judging",
    milestone: "M1",
    dueDate: "2026-05-28",
    zelleAmount: 902,
    cardAmount: 950,
    invoiceCode: "ASC-2026-0078",
  },
  {
    id: "due-vikram",
    customerId: "vikram-patel",
    customerName: "Vikram Patel",
    email: "v.patel@email.com",
    service: "Full profile",
    milestone: "M3",
    dueDate: "2026-05-28",
    zelleAmount: 1900,
    cardAmount: 2000,
    invoiceCode: "ASC-2026-0090",
  },
];

const seedPendingPayments = [
  {
    id: "pay-anjali",
    customerId: "anjali-mehta",
    customerCode: "CUS-00002",
    customerName: "Anjali Mehta",
    matchedSignals: ["name", "phone", "amount"],
    score: 100,
    amountReceived: 1425,
    invoiceId: "inv-anjali-open",
    matchedInvoiceCode: "ASC-2026-0086",
    sourceMessageId: "gmail-msg-anjali-001",
    sourceProvider: "gmail",
    sourceThreadId: "gmail-thread-anjali-001",
    messageFromEmail: "payments@zellepay.com",
    messageToEmail: "ops@setu.local",
    messageDateHeader: "Tue, 26 May 2026 10:14:00 -0500",
    transactionDate: "2026-05-26",
    senderEmail: "anjali.mehta@email.com",
    senderPhoneLast4: "1180",
    senderNameRaw: "Anjali Mehta",
    subject: "Zelle payment received from Anjali Mehta",
    transactionReference: "ZELLE-ANJ-20260526-1014",
    memo: "Authorship milestone M1",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "Anjali Mehta",
      senderEmail: "anjali.mehta@email.com",
      amountReceived: 1425,
      transactionDate: "2026-05-26",
      transactionReference: "ZELLE-ANJ-20260526-1014",
      memo: "Authorship milestone M1",
    },
    matchStatus: "matched",
    matchSummary: "CUS-00002 · name + phone + amount · score 100 · ASC-2026-0086 · Authorship M1",
    dateLabel: "May 26",
    rawText:
      "Anjali Mehta sent you $1,425.00 with memo Authorship milestone M1. Transaction number ZELLE-ANJ-20260526-1014.",
    receivedAt: "2026-05-26T15:14:00.000Z",
  },
  {
    id: "pay-priya",
    customerId: "priya-sharma",
    customerCode: "CUS-00004",
    customerName: "Priya Sharma",
    matchedSignals: ["name", "email", "amount"],
    score: 100,
    amountReceived: 1425,
    invoiceId: "inv-priya-open",
    matchedInvoiceCode: "ASC-2026-0061",
    sourceMessageId: "gmail-msg-priya-001",
    sourceProvider: "gmail",
    sourceThreadId: "gmail-thread-priya-001",
    messageFromEmail: "payments@zellepay.com",
    messageToEmail: "ops@setu.local",
    messageDateHeader: "Mon, 25 May 2026 18:22:00 -0500",
    transactionDate: "2026-05-25",
    senderEmail: "priya.s@email.com",
    senderPhoneLast4: "2210",
    senderNameRaw: "Priya Sharma",
    subject: "Zelle payment received from Priya Sharma",
    transactionReference: "ZELLE-PRI-20260525-1822",
    memo: "Media package milestone M1",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "Priya Sharma",
      senderEmail: "priya.s@email.com",
      amountReceived: 1425,
      transactionDate: "2026-05-25",
      transactionReference: "ZELLE-PRI-20260525-1822",
      memo: "Media package milestone M1",
    },
    matchStatus: "matched",
    matchSummary: "CUS-00004 · name + email + amount · score 100 · ASC-2026-0061 · Media package M1",
    dateLabel: "May 25",
    rawText:
      "Priya Sharma sent you $1,425.00. Memo: Media package milestone M1. Transaction number ZELLE-PRI-20260525-1822.",
    receivedAt: "2026-05-25T23:22:00.000Z",
  },
];

const seedExceptions = [
  {
    id: "exc-rahul",
    kind: "mismatch",
    senderName: "Rahul Kapoor",
    amount: 1800,
    expectedAmount: 1710,
    dateLabel: "May 25",
    senderEmail: "r.kapoor@email.com",
    senderPhoneLast4: "3092",
    service: "Judging",
    milestone: "M1",
    invoiceId: "inv-rahul-open",
    summary: "Amount does not match expected Zelle amount",
    sourceMessageId: "gmail-msg-rahul-001",
    transactionReference: "ZELLE-RAH-20260525-0830",
    memo: "Judging milestone M1",
    subject: "Zelle payment received from Rahul Kapoor",
    receivedAt: "2026-05-25T13:30:00.000Z",
    transactionDate: "2026-05-25",
    sourceProvider: "gmail",
    messageFromEmail: "payments@zellepay.com",
    messageToEmail: "ops@setu.local",
    rawText:
      "Rahul Kapoor sent you $1,800.00. Memo: Judging milestone M1. Transaction number ZELLE-RAH-20260525-0830.",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "Rahul Kapoor",
      senderEmail: "r.kapoor@email.com",
      amountReceived: 1800,
      transactionDate: "2026-05-25",
      transactionReference: "ZELLE-RAH-20260525-0830",
      memo: "Judging milestone M1",
    },
  },
  {
    id: "exc-sharma",
    kind: "ambiguous",
    senderName: "R. Sharma",
    amount: 1425,
    dateLabel: "May 25",
    summary: "Two customers match sender name",
    aliasName: "R. Sharma",
    senderEmail: null,
    senderPhoneLast4: null,
    sourceMessageId: "gmail-msg-sharma-001",
    transactionReference: "ZELLE-SHA-20260525-0910",
    memo: "Authorship milestone M1",
    subject: "Zelle payment received from R. Sharma",
    receivedAt: "2026-05-25T14:10:00.000Z",
    transactionDate: "2026-05-25",
    sourceProvider: "gmail",
    messageFromEmail: "payments@zellepay.com",
    messageToEmail: "ops@setu.local",
    rawText:
      "R. Sharma sent you $1,425.00. Memo: Authorship milestone M1. Transaction number ZELLE-SHA-20260525-0910.",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "R. Sharma",
      amountReceived: 1425,
      transactionDate: "2026-05-25",
      transactionReference: "ZELLE-SHA-20260525-0910",
      memo: "Authorship milestone M1",
    },
    candidates: [
      {
        customerId: "rohan-sharma",
        name: "Rohan Sharma",
        note: "Authorship M1 · exp $1,425 · phone ••••4471 · open invoice",
        primary: true,
      },
      {
        customerId: "priya-sharma",
        name: "Priya Sharma",
        note: "Media M1 · exp $1,425 · phone ••••2210 · paid May 12",
        primary: false,
      },
    ],
  },
];

const seedInvoices = [
  {
    id: "due-anjali",
    invoiceCode: "ASC-2026-0087",
    customerId: "anjali-mehta",
    customerName: "Anjali Mehta",
    email: "anjali.mehta@email.com",
    service: "Authorship",
    milestone: "M2",
    baseAmount: 1500,
    discountPct: 5,
    zelleAmount: 1425,
    cardAmount: 1500,
    dueDate: "2026-05-28",
    status: "draft",
    source: "schedule",
  },
  {
    id: "due-suresh",
    invoiceCode: "ASC-2026-0078",
    customerId: "suresh-iyer",
    customerName: "Suresh Iyer",
    email: "s.iyer@email.com",
    service: "Judging",
    milestone: "M1",
    baseAmount: 950,
    discountPct: 5.05,
    zelleAmount: 902,
    cardAmount: 950,
    dueDate: "2026-05-28",
    status: "draft",
    source: "schedule",
  },
  {
    id: "due-vikram",
    invoiceCode: "ASC-2026-0090",
    customerId: "vikram-patel",
    customerName: "Vikram Patel",
    email: "v.patel@email.com",
    service: "Full profile",
    milestone: "M3",
    baseAmount: 2000,
    discountPct: 5,
    zelleAmount: 1900,
    cardAmount: 2000,
    dueDate: "2026-05-28",
    status: "draft",
    source: "schedule",
  },
  {
    id: "inv-anjali-open",
    invoiceCode: "ASC-2026-0086",
    customerId: "anjali-mehta",
    customerName: "Anjali Mehta",
    email: "anjali.mehta@email.com",
    service: "Authorship",
    milestone: "M1",
    baseAmount: 1500,
    discountPct: 5,
    zelleAmount: 1425,
    cardAmount: 1500,
    dueDate: "2026-05-12",
    status: "sent",
    source: "schedule",
  },
  {
    id: "inv-priya-open",
    invoiceCode: "ASC-2026-0061",
    customerId: "priya-sharma",
    customerName: "Priya Sharma",
    email: "priya.s@email.com",
    service: "Media package",
    milestone: "M1",
    baseAmount: 1500,
    discountPct: 5,
    zelleAmount: 1425,
    cardAmount: 1500,
    dueDate: "2026-05-10",
    status: "sent",
    source: "schedule",
  },
  {
    id: "inv-rohan-open",
    invoiceCode: "ASC-2026-0042",
    customerId: "rohan-sharma",
    customerName: "Rohan Sharma",
    email: "rohan.sharma@gmail.com",
    service: "Authorship",
    milestone: "M1",
    baseAmount: 1500,
    discountPct: 5,
    zelleAmount: 1425,
    cardAmount: 1500,
    dueDate: "2026-05-09",
    status: "sent",
    source: "schedule",
  },
  {
    id: "inv-rahul-open",
    invoiceCode: "ASC-2026-0058",
    customerId: "rahul-kapoor",
    customerName: "Rahul Kapoor",
    email: "r.kapoor@email.com",
    service: "Judging",
    milestone: "M1",
    baseAmount: 1800,
    discountPct: 5,
    zelleAmount: 1710,
    cardAmount: 1800,
    dueDate: "2026-05-13",
    status: "sent",
    source: "schedule",
  },
  {
    id: "inv-karthik-overdue",
    invoiceCode: "ASC-2026-0033",
    customerId: "karthik-nair",
    customerName: "Karthik Nair",
    email: "k.nair@email.com",
    service: "Full profile",
    milestone: "M2",
    baseAmount: 1474,
    discountPct: 5,
    zelleAmount: 1400,
    cardAmount: 1474,
    dueDate: "2026-04-21",
    status: "overdue",
    source: "schedule",
  },
];

const seedPayments = [
  {
    id: "pay-rahul-exception",
    customerId: "rahul-kapoor",
    customerName: "Rahul Kapoor",
    customerCode: "CUS-00007",
    matchedSignals: ["name", "email"],
    score: 80,
    amountReceived: 1800,
    invoiceId: "inv-rahul-open",
    matchedInvoiceCode: "ASC-2026-0058",
    sourceMessageId: "gmail-msg-rahul-001",
    sourceProvider: "gmail",
    sourceThreadId: "gmail-thread-rahul-001",
    messageFromEmail: "no.reply.alerts@chase.com",
    messageToEmail: "ops@setu.local",
    messageDateHeader: "Mon, 25 May 2026 08:30:00 -0500",
    transactionDate: "2026-05-25",
    senderEmail: "r.kapoor@email.com",
    senderPhoneLast4: "3092",
    senderNameRaw: "Rahul Kapoor",
    subject: "You received money with Zelle",
    transactionReference: "ZELLE-RAH-20260525-0830",
    memo: "Judging milestone M1",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "Rahul Kapoor",
      senderEmail: "r.kapoor@email.com",
      amountReceived: 1800,
      transactionDate: "2026-05-25",
      transactionReference: "ZELLE-RAH-20260525-0830",
      memo: "Judging milestone M1",
    },
    matchStatus: "mismatch",
    matchSummary: "CUS-00007 · name + email · score 80 · invoice amount mismatch",
    dateLabel: "May 25",
    rawText:
      "Rahul Kapoor sent you money. Amount $1,800.00. Sent on May 25, 2026. Transaction number ZELLE-RAH-20260525-0830. Memo Judging milestone M1.",
    receivedAt: "2026-05-25T13:30:00.000Z",
    reviewStatus: "exception",
  },
  {
    id: "pay-sharma-exception",
    customerId: null,
    customerName: null,
    customerCode: null,
    matchedSignals: ["name", "amount"],
    score: 70,
    amountReceived: 1425,
    invoiceId: null,
    matchedInvoiceCode: null,
    sourceMessageId: "gmail-msg-sharma-001",
    sourceProvider: "gmail",
    sourceThreadId: "gmail-thread-sharma-001",
    messageFromEmail: "no.reply.alerts@chase.com",
    messageToEmail: "ops@setu.local",
    messageDateHeader: "Mon, 25 May 2026 09:10:00 -0500",
    transactionDate: "2026-05-25",
    senderEmail: null,
    senderPhoneLast4: null,
    senderNameRaw: "R. Sharma",
    subject: "You received money with Zelle",
    transactionReference: "ZELLE-SHA-20260525-0910",
    memo: "Authorship milestone M1",
    parsedPayload: {
      provider: "gmail",
      senderNameRaw: "R. Sharma",
      amountReceived: 1425,
      transactionDate: "2026-05-25",
      transactionReference: "ZELLE-SHA-20260525-0910",
      memo: "Authorship milestone M1",
    },
    matchStatus: "ambiguous",
    matchSummary: "Two customers share the strongest name and amount match.",
    dateLabel: "May 25",
    rawText:
      "R. Sharma sent you money. Amount $1,425.00. Sent on May 25, 2026. Transaction number ZELLE-SHA-20260525-0910. Memo Authorship milestone M1.",
    receivedAt: "2026-05-25T14:10:00.000Z",
    reviewStatus: "exception",
  },
];

const seedActivity = [];

const seedAdmin = {
  referralProgram: {
    enabled: true,
    programName: "Standard referral program",
    programDescription:
      "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
    bonusAmount: 500,
    qualifyingPaidAmount: 3000,
    qualificationMonths: 6,
  },
  referrals: [
    {
      id: "ref-rohan-priya",
      referrerCustomerId: "rohan-sharma",
      referrerCustomerName: "Rohan Sharma",
      referrerCustomerCode: "CUS-00001",
      referredCustomerId: "priya-sharma",
      referredCustomerName: "Priya Sharma",
      referredCustomerCode: "CUS-00004",
      status: "active",
      bonusAmount: 500,
      qualifyingPaidAmount: 3000,
      qualifyingMonths: 6,
      relationshipLabel: "Family",
      referredOn: "2026-05-12T16:45:00.000Z",
      notes: "Family referral from onboarding",
      qualifiedAt: null,
      awardedAt: null,
      createdAt: "2026-05-12T16:45:00.000Z",
    },
  ],
  referralSubmissions: [],
  rewards: [],
};

const seedAllPayments = [...seedPayments];

export function normalizeSeedIdentifiers(state) {
  const customerCodeMap = new Map();
  const invoiceCodeMap = new Map();

  state.customers = (state.customers ?? []).map((customer, index) => {
    const normalizedCustomerCode = normalizeCustomerCode(customer.customerCode, index + 1);
    if (customer.customerCode) {
      customerCodeMap.set(customer.customerCode, normalizedCustomerCode);
    }

    const normalizedInvoices = (customer.invoices ?? []).map((invoiceCode) => {
      const normalizedInvoiceCode = normalizeInvoiceCode(invoiceCode);
      if (invoiceCode) {
        invoiceCodeMap.set(invoiceCode, normalizedInvoiceCode);
      }
      return normalizedInvoiceCode;
    });

    return {
      ...customer,
      customerCode: normalizedCustomerCode,
      invoices: normalizedInvoices,
      contracts: customer.contracts ?? [],
      activeContract: customer.activeContract ?? customer.contracts?.[0] ?? null,
      profile: {
        serviceStartDate: null,
        ...(customer.profile ?? {}),
      },
    };
  });

  state.dueInvoices = (state.dueInvoices ?? []).map((invoice) => {
    const normalizedInvoiceCode = normalizeInvoiceCode(invoice.invoiceCode);
    if (invoice.invoiceCode) {
      invoiceCodeMap.set(invoice.invoiceCode, normalizedInvoiceCode);
    }

    return {
      ...invoice,
      invoiceCode: normalizedInvoiceCode,
    };
  });

  state.invoices = (state.invoices ?? []).map((invoice) => {
    const normalizedInvoiceCode = normalizeInvoiceCode(invoice.invoiceCode);
    if (invoice.invoiceCode) {
      invoiceCodeMap.set(invoice.invoiceCode, normalizedInvoiceCode);
    }

    return {
      ...invoice,
      invoiceCode: normalizedInvoiceCode,
    };
  });

  const textReplacements = [
    ...[...customerCodeMap.entries()].filter(([, normalized]) => normalized),
    ...[...invoiceCodeMap.entries()].filter(([, normalized]) => normalized),
  ];

  const normalizePaymentRecord = (payment) => ({
    ...payment,
    customerCode: normalizeCustomerCode(payment.customerCode) ?? payment.customerCode ?? null,
    matchedInvoiceCode:
      invoiceCodeMap.get(payment.matchedInvoiceCode) ??
      normalizeInvoiceCode(payment.matchedInvoiceCode) ??
      payment.matchedInvoiceCode ??
      null,
    matchSummary: replaceIdentifierText(payment.matchSummary, textReplacements),
  });

  state.pendingPayments = dedupeRecordsById((state.pendingPayments ?? []).map(normalizePaymentRecord));
  state.payments = dedupeRecordsById(
    (state.payments ?? []).map(normalizePaymentRecord),
    new Set(state.pendingPayments.map((payment) => payment.id).filter(Boolean)),
  );

  state.exceptions = (state.exceptions ?? []).map((exception) => ({
    ...exception,
    customerCode: normalizeCustomerCode(exception.customerCode) ?? exception.customerCode ?? null,
    matchedInvoiceCode:
      invoiceCodeMap.get(exception.matchedInvoiceCode) ??
      normalizeInvoiceCode(exception.matchedInvoiceCode) ??
      exception.matchedInvoiceCode ??
      null,
    summary: replaceIdentifierText(exception.summary, textReplacements),
    candidates: (exception.candidates ?? []).map((candidate) => ({
      ...candidate,
      note: replaceIdentifierText(candidate.note, textReplacements),
    })),
  }));

  state.admin = {
    ...(state.admin ?? {}),
    referrals: (state.admin?.referrals ?? []).map((referral) => ({
      ...referral,
      referrerCustomerCode:
        customerCodeMap.get(referral.referrerCustomerCode) ??
        normalizeCustomerCode(referral.referrerCustomerCode) ??
        referral.referrerCustomerCode ??
        null,
      referredCustomerCode:
        customerCodeMap.get(referral.referredCustomerCode) ??
        normalizeCustomerCode(referral.referredCustomerCode) ??
        referral.referredCustomerCode ??
        null,
    })),
    rewards: (state.admin?.rewards ?? []).map((reward) => ({
      ...reward,
      customerCode:
        customerCodeMap.get(reward.customerCode) ??
        normalizeCustomerCode(reward.customerCode) ??
        reward.customerCode ??
        null,
    })),
  };

  const derivedNextInvoiceSequence = [
    ...(state.invoices ?? []).map((invoice) => extractInvoiceSequence(invoice.invoiceCode)),
    ...(state.dueInvoices ?? []).map((invoice) => extractInvoiceSequence(invoice.invoiceCode)),
    ...(state.customers ?? []).flatMap((customer) =>
      (customer.invoices ?? []).map((invoiceCode) => extractInvoiceSequence(invoiceCode)),
    ),
  ].reduce((max, numeric) => (Number.isFinite(numeric) ? Math.max(max, numeric) : max), 0);

  state.nextInvoiceSequence = Math.max(Number(state.nextInvoiceSequence || 1), derivedNextInvoiceSequence + 1);

  return state;
}

export function createInitialState() {
  return normalizeSeedIdentifiers(
    structuredClone({
      customers: seedCustomers,
      dashboard: seedDashboard,
      dueInvoices: seedDueInvoices,
      pendingPayments: seedPendingPayments,
      exceptions: seedExceptions,
      invoices: seedInvoices,
      payments: seedAllPayments,
      processedMessageIds: [],
      activity: seedActivity,
      nextInvoiceSequence: 91,
      integrations: {
        gmail: {
          lastSyncAt: null,
          lastSyncSummary: null,
          autoSyncSettings: {
            enabled: true,
            intervalMinutes: 5,
            startupDelaySeconds: 15,
            updatedAt: null,
            updatedBy: null,
          },
        },
      },
      admin: seedAdmin,
    }),
  );
}

export function createInvoiceRefPreview(sequence) {
  return makeInvoiceCode(sequence);
}
