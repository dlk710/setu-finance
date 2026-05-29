export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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
