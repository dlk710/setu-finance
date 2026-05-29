export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function parseDisplayDate(value) {
  if (!value) {
    return new Date("");
  }

  if (value instanceof Date) {
    return value;
  }

  const stringValue = String(value);
  const parsed = stringValue.includes("T")
    ? new Date(stringValue)
    : new Date(`${stringValue}T12:00:00`);
  return parsed;
}

function parseTimelineDate(value) {
  if (!value) {
    return null;
  }

  const parsed = parseDisplayDate(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseDisplayDate(value));
}

export function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parseDisplayDate(value));
}

export function calculateZelleAmount(amount, discountPct) {
  return Math.round(Number(amount || 0) * (1 - Number(discountPct || 0) / 100));
}

export function makeInvoiceCode(sequence) {
  return `ASC-2026-${String(sequence).padStart(4, "0")}`;
}

export function normalizeDigits(value) {
  return value.replace(/\D/g, "");
}

export function summarizeContacts(customer) {
  const emailCount = customer.emails.length;
  const phoneCount = customer.phones.length;
  return `${emailCount} email${emailCount === 1 ? "" : "s"} · ${phoneCount} phone${phoneCount === 1 ? "" : "s"}`;
}

export function searchCustomers(customers, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return customers.map((customer) => ({
      ...customer,
      matchField: null,
      matchValue: null,
    }));
  }

  const digitQuery = normalizeDigits(trimmed);

  return customers
    .map((customer) => {
      if (customer.customerCode?.toLowerCase().includes(trimmed)) {
        return { ...customer, matchField: "customerId", matchValue: customer.customerCode };
      }

      if (customer.name.toLowerCase().includes(trimmed)) {
        return { ...customer, matchField: "name", matchValue: customer.name };
      }

      const emailMatch = customer.emails.find(({ value }) => value.toLowerCase().includes(trimmed));
      if (emailMatch) {
        return { ...customer, matchField: "email", matchValue: emailMatch.value };
      }

      if (digitQuery) {
        const phoneMatch = customer.phones.find(({ value }) =>
          normalizeDigits(value).includes(digitQuery),
        );
        if (phoneMatch) {
          return { ...customer, matchField: "phone", matchValue: phoneMatch.value };
        }
      }

      const aliasMatch = customer.aliases.find(
        ({ name, email, phoneLast4 }) =>
          name.toLowerCase().includes(trimmed) ||
          (email && email.toLowerCase().includes(trimmed)) ||
          (phoneLast4 && phoneLast4.includes(trimmed)),
      );

      if (aliasMatch) {
        return {
          ...customer,
          matchField: "alias",
          matchValue: aliasMatch.email || aliasMatch.name,
        };
      }

      const invoiceMatch = customer.invoices.find((invoiceCode) =>
        invoiceCode.toLowerCase().includes(trimmed),
      );

      if (invoiceMatch) {
        return { ...customer, matchField: "invoice", matchValue: invoiceMatch };
      }

      return null;
    })
    .filter(Boolean);
}

export function searchCustomersByIdentity(customers, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const digitQuery = normalizeDigits(trimmed);

  return customers
    .map((customer) => {
      if (customer.customerCode?.toLowerCase().includes(trimmed)) {
        return { ...customer, matchField: "customerId", matchValue: customer.customerCode };
      }

      if (customer.name.toLowerCase().includes(trimmed)) {
        return { ...customer, matchField: "name", matchValue: customer.name };
      }

      const emailMatch = customer.emails.find(({ value }) => value.toLowerCase().includes(trimmed));
      if (emailMatch) {
        return { ...customer, matchField: "email", matchValue: emailMatch.value };
      }

      if (digitQuery) {
        const phoneMatch = customer.phones.find(({ value }) =>
          normalizeDigits(value).includes(digitQuery),
        );
        if (phoneMatch) {
          return { ...customer, matchField: "phone", matchValue: phoneMatch.value };
        }
      }

      return null;
    })
    .filter(Boolean);
}

export function highlightMatch(text, query) {
  if (!query) {
    return text;
  }

  const start = text.toLowerCase().indexOf(query.toLowerCase());
  if (start === -1) {
    return text;
  }

  const end = start + query.length;
  return `${text.slice(0, start)}<span class="hl">${text.slice(start, end)}</span>${text.slice(end)}`;
}

const TRANSACTION_RANGE_CONFIG = {
  day: {
    key: "day",
    label: "Day",
    bucketCount: 14,
    unit: "day",
    windowLabel: "Daily totals",
    axisLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date);
    },
    detailLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    },
  },
  week: {
    key: "week",
    label: "Week",
    bucketCount: 12,
    unit: "week",
    windowLabel: "Weekly totals",
    axisLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date);
    },
    detailLabel(date) {
      return `Week of ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date)}`;
    },
  },
  month: {
    key: "month",
    label: "Month",
    bucketCount: 12,
    unit: "month",
    windowLabel: "Monthly totals",
    axisLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "2-digit",
      }).format(date);
    },
    detailLabel(date) {
      return new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(date);
    },
  },
  year: {
    key: "year",
    label: "Year",
    bucketCount: 5,
    unit: "year",
    windowLabel: "Yearly totals",
    axisLabel(date) {
      return String(date.getFullYear());
    },
    detailLabel(date) {
      return String(date.getFullYear());
    },
  },
};

function getTimelineConfig(rangeKey) {
  return TRANSACTION_RANGE_CONFIG[rangeKey] ?? TRANSACTION_RANGE_CONFIG.month;
}

function getPaymentTimelineDate(payment) {
  return (
    parseTimelineDate(payment.appliedAt) ??
    parseTimelineDate(payment.receivedAt) ??
    parseTimelineDate(payment.transactionDate)
  );
}

function shouldExcludeFromTrend(payment) {
  return Boolean(payment.duplicateOfPaymentId);
}

function startOfWeek(value) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = date.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - daysFromMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfPeriod(value, unit) {
  const date = new Date(value);

  if (unit === "year") {
    return new Date(date.getFullYear(), 0, 1);
  }

  if (unit === "month") {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  if (unit === "week") {
    return startOfWeek(date);
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addPeriods(value, unit, amount) {
  const date = new Date(value);
  if (unit === "year") {
    date.setFullYear(date.getFullYear() + amount);
    return startOfPeriod(date, unit);
  }

  if (unit === "month") {
    date.setMonth(date.getMonth() + amount, 1);
    return startOfPeriod(date, unit);
  }

  if (unit === "week") {
    date.setDate(date.getDate() + amount * 7);
    return startOfPeriod(date, unit);
  }

  date.setDate(date.getDate() + amount);
  return startOfPeriod(date, unit);
}

function makeBucketKey(date, unit) {
  if (unit === "year") {
    return `${date.getFullYear()}`;
  }

  if (unit === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  if (unit === "week" || unit === "day") {
    return date.toISOString().slice(0, 10);
  }

  return date.toISOString();
}

function createBucket(config, start, index) {
  const bucketStart = addPeriods(start, config.unit, index);
  return {
    index,
    start: bucketStart,
    key: makeBucketKey(bucketStart, config.unit),
    axisLabel: config.axisLabel(bucketStart),
    detailLabel: config.detailLabel(bucketStart),
    amount: 0,
    count: 0,
  };
}

function createNiceScaleMax(value) {
  if (!value || value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  let niceNormalized = 10;

  if (normalized <= 1) {
    niceNormalized = 1;
  } else if (normalized <= 2) {
    niceNormalized = 2;
  } else if (normalized <= 5) {
    niceNormalized = 5;
  }

  return niceNormalized * magnitude;
}

export function buildTransactionTrend(payments = [], rangeKey = "month") {
  const config = getTimelineConfig(rangeKey);
  const timelinePayments = payments
    .filter((payment) => !shouldExcludeFromTrend(payment))
    .map((payment) => {
      const timestamp = getPaymentTimelineDate(payment);
      if (!timestamp) {
        return null;
      }

      return {
        ...payment,
        timelineDate: timestamp,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.timelineDate.getTime() - right.timelineDate.getTime());

  const anchorDate = startOfPeriod(timelinePayments.at(-1)?.timelineDate ?? new Date(), config.unit);
  const start = addPeriods(anchorDate, config.unit, -(config.bucketCount - 1));
  const buckets = Array.from({ length: config.bucketCount }, (_, index) =>
    createBucket(config, start, index),
  );
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  const totals = {
    amount: 0,
    count: 0,
  };

  for (const payment of timelinePayments) {
    const bucketKey = makeBucketKey(startOfPeriod(payment.timelineDate, config.unit), config.unit);
    const bucket = bucketByKey.get(bucketKey);
    if (!bucket) {
      continue;
    }

    const amount = Number(payment.amountReceived || 0);
    bucket.amount += amount;
    bucket.count += 1;
    totals.amount += amount;
    totals.count += 1;
  }

  const maxAmount = createNiceScaleMax(Math.max(...buckets.map((bucket) => bucket.amount), 0));
  const maxLabels = 4;
  const step = Math.max(1, Math.ceil(buckets.length / maxLabels));
  const labelIndices = buckets
    .map((bucket, index) => index)
    .filter((index) => index % step === 0 || index === buckets.length - 1);
  const latestNonZeroBucket = [...buckets].reverse().find((bucket) => bucket.amount > 0) ?? null;

  return {
    rangeKey: config.key,
    rangeLabel: config.label,
    windowLabel: config.windowLabel,
    anchorDate,
    buckets,
    maxAmount,
    labelIndices,
    totals,
    latestNonZeroBucket,
    empty: totals.count === 0,
  };
}
