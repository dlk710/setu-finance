import { createInvoiceRefPreview } from "../shared/seedState.js";
import { prepareDatabase } from "./db/seed.js";
import { buildInitials, normalizeDigits, normalizeEmail, normalizeName } from "./db/normalizers.js";
import { withTransaction } from "./db/pool.js";

const DASHBOARD_PERIOD_KEY = "current";

function calculateZelleAmount(amount, discountPct) {
  return Math.round(Number(amount || 0) * (1 - Number(discountPct || 0) / 100));
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoiceCode: row.invoice_code,
    customerId: row.customer_id,
    customerName: row.customer_name,
    email: row.delivery_email,
    service: row.service_name,
    milestone: row.milestone,
    baseAmount: Number(row.base_amount || 0),
    discountPct: Number(row.discount_pct || 0),
    zelleAmount: Number(row.zelle_amount || 0),
    cardAmount: Number(row.card_amount || 0),
    dueDate: row.due_date,
    status: row.status,
    source: row.source,
  };
}

function mapPaymentRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id ?? null,
    customerName: row.customer_name ?? row.resolved_customer_name ?? null,
    matchedSignals: row.matched_signals ?? [],
    score: Number(row.score || 0),
    amountReceived: Number(row.amount_received || 0),
    invoiceId: row.invoice_id ?? null,
    sourceMessageId: row.source_message_id ?? null,
    senderEmail: row.sender_email ?? null,
    senderPhoneLast4: row.sender_phone_last4 ?? null,
    senderNameRaw: row.sender_name_raw ?? null,
    subject: row.subject ?? null,
    dateLabel: row.date_label ?? null,
    rawText: row.raw_text ?? null,
    receivedAt: formatTimestamp(row.received_at),
    reviewStatus: row.review_status,
  };
}

function findPrimaryEmail(customer) {
  return (
    customer?.emails.find((email) => email.isPrimary)?.value ??
    customer?.emails[0]?.value ??
    null
  );
}

async function hydratePortalState(client) {
  const customersResult = await client.query(`
    SELECT id, initials, full_name, normalized_name
    FROM customers
    ORDER BY full_name ASC
  `);
  const servicesResult = await client.query(`
    SELECT customer_id, service_name
    FROM customer_services
    ORDER BY customer_id, service_name
  `);
  const emailsResult = await client.query(`
    SELECT customer_id, email, label, is_primary
    FROM customer_emails
    ORDER BY customer_id, is_primary DESC, created_at ASC, id ASC
  `);
  const phonesResult = await client.query(`
    SELECT customer_id, phone_value, label, is_primary
    FROM customer_phones
    ORDER BY customer_id, is_primary DESC, created_at ASC, id ASC
  `);
  const aliasesResult = await client.query(`
    SELECT customer_id, alias_name, relation, email, phone_last4
    FROM customer_aliases
    ORDER BY customer_id, created_at ASC, id ASC
  `);
  const invoicesResult = await client.query(`
    SELECT
      invoices.*,
      customers.full_name AS customer_name
    FROM invoices
    JOIN customers ON customers.id = invoices.customer_id
    ORDER BY invoices.due_date DESC, invoices.created_at DESC, invoices.id DESC
  `);
  const paymentsResult = await client.query(`
    SELECT
      payments.*,
      customers.full_name AS resolved_customer_name
    FROM payments
    LEFT JOIN customers ON customers.id = payments.customer_id
    ORDER BY COALESCE(payments.received_at, payments.created_at) DESC, payments.created_at DESC, payments.id DESC
  `);
  const exceptionsResult = await client.query(`
    SELECT *
    FROM exceptions
    WHERE status = 'open'
    ORDER BY created_at DESC, id DESC
  `);
  const exceptionCandidatesResult = await client.query(`
    SELECT *
    FROM exception_candidates
    ORDER BY exception_id, sort_order ASC
  `);
  const activityResult = await client.query(`
    SELECT id, label
    FROM activity_events
    ORDER BY created_at DESC, id DESC
  `);
  const processedMessagesResult = await client.query(`
    SELECT message_id
    FROM processed_messages
    ORDER BY processed_at DESC, message_id DESC
  `);
  const sequenceResult = await client.query(`
    SELECT next_value
    FROM app_sequences
    WHERE sequence_name = 'invoice'
  `);
  const gmailIntegrationResult = await client.query(`
    SELECT state_json
    FROM integration_states
    WHERE integration_key = 'gmail'
  `);
  const dashboardResult = await client.query(
    `
      SELECT *
      FROM dashboard_snapshots
      WHERE period_key = $1
    `,
    [DASHBOARD_PERIOD_KEY],
  );
  const agingResult = await client.query(
    `
      SELECT label, amount, width, tone
      FROM dashboard_aging_buckets
      WHERE period_key = $1
      ORDER BY sort_order ASC
    `,
    [DASHBOARD_PERIOD_KEY],
  );
  const seriesResult = await client.query(
    `
      SELECT month_label, zelle, stripe
      FROM dashboard_collection_series
      WHERE period_key = $1
      ORDER BY sort_order ASC
    `,
    [DASHBOARD_PERIOD_KEY],
  );

  const customers = customersResult.rows.map((row) => ({
    id: row.id,
    initials: row.initials,
    name: row.full_name,
    services: [],
    emails: [],
    phones: [],
    aliases: [],
    invoices: [],
  }));
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

  for (const row of servicesResult.rows) {
    customerMap.get(row.customer_id)?.services.push(row.service_name);
  }

  for (const row of emailsResult.rows) {
    customerMap.get(row.customer_id)?.emails.push({
      value: row.email,
      label: row.label,
      isPrimary: row.is_primary,
    });
  }

  for (const row of phonesResult.rows) {
    customerMap.get(row.customer_id)?.phones.push({
      value: row.phone_value,
      label: row.label,
      isPrimary: row.is_primary,
    });
  }

  for (const row of aliasesResult.rows) {
    customerMap.get(row.customer_id)?.aliases.push({
      name: row.alias_name,
      relation: row.relation,
      email: row.email,
      phoneLast4: row.phone_last4,
    });
  }

  const invoices = invoicesResult.rows.map((row) => {
    const invoice = mapInvoiceRow(row);
    const customer = customerMap.get(invoice.customerId);
    if (customer && !customer.invoices.includes(invoice.invoiceCode)) {
      customer.invoices.push(invoice.invoiceCode);
    }
    return invoice;
  });

  const payments = paymentsResult.rows.map(mapPaymentRow);
  const pendingPayments = payments
    .filter((payment) => payment.reviewStatus === "pending")
    .map((payment) => ({
      id: payment.id,
      customerId: payment.customerId,
      customerName: payment.customerName,
      matchedSignals: payment.matchedSignals,
      score: payment.score,
      amountReceived: payment.amountReceived,
      invoiceId: payment.invoiceId,
      sourceMessageId: payment.sourceMessageId,
      senderEmail: payment.senderEmail,
      senderPhoneLast4: payment.senderPhoneLast4,
      senderNameRaw: payment.senderNameRaw,
      receivedAt: payment.receivedAt,
    }));

  const exceptionCandidates = new Map();
  for (const row of exceptionCandidatesResult.rows) {
    const current = exceptionCandidates.get(row.exception_id) ?? [];
    current.push({
      customerId: row.customer_id,
      name: row.candidate_name,
      note: row.note,
      primary: row.is_primary,
    });
    exceptionCandidates.set(row.exception_id, current);
  }

  const exceptions = exceptionsResult.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    senderName: row.sender_name,
    amount: Number(row.amount || 0),
    expectedAmount:
      row.expected_amount === null || row.expected_amount === undefined
        ? null
        : Number(row.expected_amount),
    dateLabel: row.date_label,
    senderEmail: row.sender_email,
    senderPhoneLast4: row.sender_phone_last4,
    service: row.service_name,
    milestone: row.milestone,
    invoiceId: row.invoice_id,
    summary: row.summary,
    aliasName: row.alias_name,
    sourceMessageId: row.source_message_id,
    candidates: exceptionCandidates.get(row.id) ?? [],
  }));

  const currentDashboard = dashboardResult.rows[0];
  const gmailState = gmailIntegrationResult.rows[0]?.state_json ?? {
    lastSyncAt: null,
    lastSyncSummary: null,
  };

  return {
    customers,
    dashboard: currentDashboard
      ? {
          dateLabel: currentDashboard.date_label,
          periodLabel: currentDashboard.period_label,
          metrics: {
            collected: Number(currentDashboard.collected || 0),
            outstanding: Number(currentDashboard.outstanding || 0),
            expected: Number(currentDashboard.expected || 0),
            autoMatchRate: currentDashboard.auto_match_rate,
            avgDaysToPay: currentDashboard.avg_days_to_pay,
            activeCustomers: Number(currentDashboard.active_customers || 0),
            manualHoursSaved: currentDashboard.manual_hours_saved,
          },
          aging: agingResult.rows.map((row) => ({
            label: row.label,
            amount: Number(row.amount || 0),
            width: Number(row.width || 0),
            tone: row.tone,
          })),
          chartData: seriesResult.rows.map((row) => ({
            month: row.month_label,
            zelle: Number(row.zelle || 0),
            stripe: Number(row.stripe || 0),
          })),
        }
      : {
          dateLabel: "",
          periodLabel: "",
          metrics: {
            collected: 0,
            outstanding: 0,
            expected: 0,
            autoMatchRate: "0%",
            avgDaysToPay: "0",
            activeCustomers: 0,
            manualHoursSaved: "0h",
          },
          aging: [],
          chartData: [],
        },
    dueInvoices: invoices
      .filter((invoice) => invoice.status === "draft")
      .map((invoice) => ({
        id: invoice.id,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        email: invoice.email,
        service: invoice.service,
        milestone: invoice.milestone,
        dueDate: invoice.dueDate,
        zelleAmount: invoice.zelleAmount,
        cardAmount: invoice.cardAmount,
        invoiceCode: invoice.invoiceCode,
      })),
    pendingPayments,
    exceptions,
    invoices,
    payments,
    processedMessageIds: processedMessagesResult.rows.map((row) => row.message_id),
    activity: activityResult.rows.map((row) => ({
      id: row.id,
      label: row.label,
    })),
    nextInvoiceSequence: sequenceResult.rows[0]?.next_value ?? 1,
    integrations: {
      gmail: {
        lastSyncAt: gmailState.lastSyncAt ?? null,
        lastSyncSummary: gmailState.lastSyncSummary ?? null,
      },
    },
  };
}

async function insertActivity(client, label) {
  await client.query(
    `
      INSERT INTO activity_events (id, label, created_at)
      VALUES ($1, $2, NOW())
    `,
    [crypto.randomUUID(), label],
  );
}

async function fetchCustomerAggregate(client, customerId) {
  const customerResult = await client.query(
    `
      SELECT id, initials, full_name
      FROM customers
      WHERE id = $1
    `,
    [customerId],
  );

  const row = customerResult.rows[0];
  if (!row) {
    return null;
  }

  const [servicesResult, emailsResult, phonesResult, aliasesResult, invoicesResult] = await Promise.all([
    client.query(
      `
        SELECT service_name
        FROM customer_services
        WHERE customer_id = $1
        ORDER BY service_name ASC
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT email, label, is_primary
        FROM customer_emails
        WHERE customer_id = $1
        ORDER BY is_primary DESC, created_at ASC, id ASC
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT phone_value, label, is_primary
        FROM customer_phones
        WHERE customer_id = $1
        ORDER BY is_primary DESC, created_at ASC, id ASC
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT alias_name, relation, email, phone_last4
        FROM customer_aliases
        WHERE customer_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT invoice_code
        FROM invoices
        WHERE customer_id = $1
        ORDER BY due_date DESC, created_at DESC, id DESC
      `,
      [customerId],
    ),
  ]);

  return {
    id: row.id,
    initials: row.initials,
    name: row.full_name,
    services: servicesResult.rows.map((item) => item.service_name),
    emails: emailsResult.rows.map((item) => ({
      value: item.email,
      label: item.label,
      isPrimary: item.is_primary,
    })),
    phones: phonesResult.rows.map((item) => ({
      value: item.phone_value,
      label: item.label,
      isPrimary: item.is_primary,
    })),
    aliases: aliasesResult.rows.map((item) => ({
      name: item.alias_name,
      relation: item.relation,
      email: item.email,
      phoneLast4: item.phone_last4,
    })),
    invoices: invoicesResult.rows.map((item) => item.invoice_code),
  };
}

async function reserveNextInvoiceCode(client) {
  await client.query(`
    INSERT INTO app_sequences (sequence_name, next_value)
    VALUES ('invoice', 1)
    ON CONFLICT (sequence_name) DO NOTHING
  `);

  const sequenceResult = await client.query(
    `
      SELECT next_value
      FROM app_sequences
      WHERE sequence_name = 'invoice'
      FOR UPDATE
    `,
  );
  const currentValue = Number(sequenceResult.rows[0]?.next_value ?? 1);

  await client.query(
    `
      UPDATE app_sequences
      SET next_value = $2
      WHERE sequence_name = $1
    `,
    ["invoice", currentValue + 1],
  );

  return {
    sequence: currentValue,
    invoiceCode: createInvoiceRefPreview(currentValue),
  };
}

async function fetchInvoiceForUpdate(client, invoiceId) {
  const result = await client.query(
    `
      SELECT
        invoices.*,
        customers.full_name AS customer_name
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      WHERE invoices.id = $1
      FOR UPDATE
    `,
    [invoiceId],
  );

  return result.rows[0] ?? null;
}

async function fetchPendingPaymentForUpdate(client, paymentId) {
  const result = await client.query(
    `
      SELECT
        payments.*,
        customers.full_name AS resolved_customer_name
      FROM payments
      LEFT JOIN customers ON customers.id = payments.customer_id
      WHERE payments.id = $1
        AND payments.review_status = 'pending'
      FOR UPDATE
    `,
    [paymentId],
  );

  return result.rows[0] ?? null;
}

async function fetchExceptionForUpdate(client, exceptionId) {
  const result = await client.query(
    `
      SELECT *
      FROM exceptions
      WHERE id = $1
        AND status = 'open'
      FOR UPDATE
    `,
    [exceptionId],
  );

  return result.rows[0] ?? null;
}

async function resolveInvoiceForPayment(client, paymentRow) {
  if (paymentRow.invoice_id) {
    const result = await client.query(
      `
        SELECT
          invoices.*,
          customers.full_name AS customer_name
        FROM invoices
        JOIN customers ON customers.id = invoices.customer_id
        WHERE invoices.id = $1
      `,
      [paymentRow.invoice_id],
    );
    return result.rows[0] ? mapInvoiceRow(result.rows[0]) : null;
  }

  if (!paymentRow.customer_id) {
    return null;
  }

  const result = await client.query(
    `
      SELECT
        invoices.*,
        customers.full_name AS customer_name
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      WHERE invoices.customer_id = $1
        AND invoices.status IN ('sent', 'overdue')
        AND ROUND(invoices.zelle_amount) = ROUND($2::numeric)
      ORDER BY invoices.due_date DESC, invoices.created_at DESC
      LIMIT 1
    `,
    [paymentRow.customer_id, Number(paymentRow.amount_received || 0)],
  );

  return result.rows[0] ? mapInvoiceRow(result.rows[0]) : null;
}

async function upsertGmailIntegrationState(client, gmailState) {
  await client.query(
    `
      INSERT INTO integration_states (integration_key, state_json, updated_at)
      VALUES ('gmail', $1::jsonb, NOW())
      ON CONFLICT (integration_key)
      DO UPDATE
      SET state_json = EXCLUDED.state_json,
          updated_at = NOW()
    `,
    [JSON.stringify(gmailState)],
  );
}

export async function prepareStateStore() {
  await prepareDatabase();
}

export async function loadState() {
  return withTransaction((client) => hydratePortalState(client), { readOnly: true });
}

export async function listDueInvoiceIds() {
  return withTransaction(
    async (client) => {
      const result = await client.query(`
        SELECT id
        FROM invoices
        WHERE status = 'draft'
        ORDER BY due_date DESC, created_at DESC, id DESC
      `);
      return result.rows.map((row) => row.id);
    },
    { readOnly: true },
  );
}

export async function listPendingPaymentIds() {
  return withTransaction(
    async (client) => {
      const result = await client.query(`
        SELECT id
        FROM payments
        WHERE review_status = 'pending'
        ORDER BY COALESCE(received_at, created_at) DESC, created_at DESC, id DESC
      `);
      return result.rows.map((row) => row.id);
    },
    { readOnly: true },
  );
}

export async function sendQueuedInvoice(invoiceId, deliverInvoice) {
  return withTransaction(async (client) => {
    const invoiceRow = await fetchInvoiceForUpdate(client, invoiceId);
    if (!invoiceRow) {
      throw new Error("Invoice not found in the due-to-send queue.");
    }

    if (invoiceRow.status !== "draft") {
      throw new Error("This invoice is no longer waiting to be sent.");
    }

    const customer = await fetchCustomerAggregate(client, invoiceRow.customer_id);
    if (!customer) {
      throw new Error("Customer record not found for this invoice.");
    }

    const recipient = invoiceRow.delivery_email || findPrimaryEmail(customer);
    if (!recipient) {
      throw new Error("This invoice does not have a deliverable email address.");
    }

    const invoice = mapInvoiceRow(invoiceRow);
    await deliverInvoice({ customer, invoice, recipient });

    await client.query(
      `
        UPDATE invoices
        SET status = 'sent',
            delivery_email = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [invoiceId, recipient],
    );

    await insertActivity(client, `Invoice ${invoice.invoiceCode} sent to ${invoice.customerName}`);

    return {
      state: await hydratePortalState(client),
      message: `Invoice sent to ${invoice.customerName}`,
    };
  });
}

export async function createInvoiceRecord({ form, sendNow, deliverInvoice }) {
  return withTransaction(async (client) => {
    const isNewCustomer = form.selectedCustomerId === "new";
    const existingCustomer = isNewCustomer
      ? null
      : await fetchCustomerAggregate(client, form.selectedCustomerId);
    const customerName = isNewCustomer ? form.customerName?.trim() : existingCustomer?.name;

    if (!customerName) {
      throw new Error("Customer name is required before creating an invoice.");
    }

    const customerId = isNewCustomer ? `customer-${crypto.randomUUID()}` : existingCustomer.id;
    const customerEmail = isNewCustomer
      ? form.customerEmail?.trim()
      : form.selectedEmail || findPrimaryEmail(existingCustomer);
    const customerPhone = isNewCustomer
      ? form.customerPhone?.trim()
      : existingCustomer?.phones?.[0]?.value ?? null;

    if (isNewCustomer) {
      await client.query(
        `
          INSERT INTO customers (id, initials, full_name, normalized_name, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
        `,
        [customerId, buildInitials(customerName), customerName, normalizeName(customerName)],
      );

      if (customerEmail) {
        await client.query(
          `
            INSERT INTO customer_emails (id, customer_id, email, normalized_email, label, is_primary)
            VALUES ($1, $2, $3, $4, $5, TRUE)
          `,
          [
            `email-${customerId}-1`,
            customerId,
            customerEmail,
            normalizeEmail(customerEmail),
            "personal",
          ],
        );
      }

      if (customerPhone) {
        const digits = normalizeDigits(customerPhone);
        await client.query(
          `
            INSERT INTO customer_phones (id, customer_id, phone_value, normalized_digits, phone_last4, label, is_primary)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
          `,
          [
            `phone-${customerId}-1`,
            customerId,
            customerPhone,
            digits,
            digits.slice(-4) || "0000",
            "mobile",
          ],
        );
      }
    }

    await client.query(
      `
        INSERT INTO customer_services (customer_id, service_name)
        VALUES ($1, $2)
        ON CONFLICT (customer_id, service_name) DO NOTHING
      `,
      [customerId, form.service],
    );

    if (!isNewCustomer) {
      await client.query(
        `
          UPDATE customers
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [customerId],
      );
    }

    const { invoiceCode } = await reserveNextInvoiceCode(client);
    const amount = Number(form.amount || 0);
    const discountPct = Number(form.discountPct || 0);
    const invoice = {
      id: `inv-${crypto.randomUUID()}`,
      invoiceCode,
      customerId,
      customerName,
      email: customerEmail ?? null,
      service: form.service,
      milestone: form.milestone ?? null,
      baseAmount: amount,
      discountPct,
      zelleAmount: calculateZelleAmount(amount, discountPct),
      cardAmount: amount,
      dueDate: form.dueDate,
      status: sendNow ? "sent" : "draft",
      source: "manual",
    };

    const customer = isNewCustomer
      ? {
          id: customerId,
          initials: buildInitials(customerName),
          name: customerName,
          services: [form.service],
          emails: customerEmail
            ? [{ value: customerEmail, label: "personal", isPrimary: true }]
            : [],
          phones: customerPhone
            ? [{ value: customerPhone, label: "mobile", isPrimary: true }]
            : [],
          aliases: [],
          invoices: [],
        }
      : {
          ...existingCustomer,
          services: existingCustomer.services.includes(form.service)
            ? existingCustomer.services
            : [...existingCustomer.services, form.service],
        };

    if (sendNow) {
      if (!customerEmail) {
        throw new Error("An email address is required before sending this invoice.");
      }

      await deliverInvoice({
        customer,
        invoice,
        recipient: customerEmail,
      });
    }

    await client.query(
      `
        INSERT INTO invoices (
          id,
          invoice_code,
          customer_id,
          delivery_email,
          service_name,
          milestone,
          base_amount,
          discount_pct,
          zelle_amount,
          card_amount,
          due_date,
          status,
          source,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `,
      [
        invoice.id,
        invoice.invoiceCode,
        invoice.customerId,
        invoice.email,
        invoice.service,
        invoice.milestone,
        invoice.baseAmount,
        invoice.discountPct,
        invoice.zelleAmount,
        invoice.cardAmount,
        invoice.dueDate,
        invoice.status,
        invoice.source,
      ],
    );

    await insertActivity(
      client,
      `${invoice.invoiceCode} ${sendNow ? "sent to" : "drafted for"} ${invoice.customerName}`,
    );

    return {
      state: await hydratePortalState(client),
      message: sendNow ? "Invoice created and sent." : "Draft invoice saved.",
    };
  });
}

export async function confirmPendingPaymentRecord(paymentId, deliverReceipt) {
  return withTransaction(async (client) => {
    const paymentRow = await fetchPendingPaymentForUpdate(client, paymentId);
    if (!paymentRow) {
      throw new Error("Payment not found in the confirmation queue.");
    }

    if (!paymentRow.customer_id) {
      throw new Error("Customer record not found for this payment.");
    }

    const customer = await fetchCustomerAggregate(client, paymentRow.customer_id);
    if (!customer) {
      throw new Error("Customer record not found for this payment.");
    }

    const invoice = await resolveInvoiceForPayment(client, paymentRow);
    const payment = mapPaymentRow(paymentRow);
    const recipient =
      payment.senderEmail && payment.senderEmail.includes("@")
        ? payment.senderEmail
        : findPrimaryEmail(customer);

    if (!recipient) {
      throw new Error("No receipt email address is available for this customer.");
    }

    await deliverReceipt({ customer, payment, invoice, recipient });

    if (invoice) {
      await client.query(
        `
          UPDATE invoices
          SET status = 'paid',
              updated_at = NOW()
          WHERE id = $1
        `,
        [invoice.id],
      );
    }

    await client.query(
      `
        UPDATE payments
        SET review_status = 'confirmed',
            updated_at = NOW()
        WHERE id = $1
      `,
      [paymentId],
    );

    await insertActivity(client, `Payment confirmed for ${customer.name}`);

    return {
      state: await hydratePortalState(client),
      message: `Payment confirmed. Receipt emailed to ${customer.name}`,
    };
  });
}

export async function resolveExceptionRecord({
  exceptionId,
  actionType,
  candidateCustomerId,
  saveAlias = false,
}) {
  return withTransaction(async (client) => {
    const exception = await fetchExceptionForUpdate(client, exceptionId);
    if (!exception) {
      throw new Error("Exception item not found.");
    }

    if (
      exception.kind === "ambiguous" &&
      candidateCustomerId &&
      saveAlias &&
      exception.alias_name
    ) {
      const aliasCheck = await client.query(
        `
          SELECT 1
          FROM customer_aliases
          WHERE customer_id = $1
            AND normalized_name = $2
          LIMIT 1
        `,
        [candidateCustomerId, normalizeName(exception.alias_name)],
      );

      if (!aliasCheck.rowCount) {
        await client.query(
          `
            INSERT INTO customer_aliases (
              id,
              customer_id,
              alias_name,
              normalized_name,
              relation,
              email,
              normalized_email,
              phone_last4,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          `,
          [
            `alias-${candidateCustomerId}-${crypto.randomUUID()}`,
            candidateCustomerId,
            exception.alias_name,
            normalizeName(exception.alias_name),
            "other",
            exception.sender_email ?? null,
            exception.sender_email ? normalizeEmail(exception.sender_email) : null,
            exception.sender_phone_last4 ?? null,
          ],
        );
      }
    }

    if (exception.kind === "mismatch" && exception.invoice_id && actionType === "accept_full") {
      await client.query(
        `
          UPDATE invoices
          SET status = 'paid',
              updated_at = NOW()
          WHERE id = $1
        `,
        [exception.invoice_id],
      );
    }

    await client.query(
      `
        UPDATE exceptions
        SET status = 'resolved',
            resolution_action = $2,
            resolved_at = NOW()
        WHERE id = $1
      `,
      [exceptionId, actionType],
    );

    await insertActivity(client, `${exception.sender_name} resolved: ${actionType}`);

    return {
      state: await hydratePortalState(client),
      message: "Exception resolved.",
    };
  });
}

export async function applyGmailSyncResult(syncResult) {
  return withTransaction(async (client) => {
    for (const messageId of syncResult.processedMessageIds ?? []) {
      await client.query(
        `
          INSERT INTO processed_messages (message_id, processed_at)
          VALUES ($1, NOW())
          ON CONFLICT (message_id) DO NOTHING
        `,
        [messageId],
      );
    }

    for (const payment of syncResult.paymentsToInsert ?? []) {
      await client.query(
        `
          INSERT INTO payments (
            id,
            customer_id,
            invoice_id,
            customer_name,
            sender_name_raw,
            sender_email,
            sender_phone_last4,
            amount_received,
            matched_signals,
            score,
            source_message_id,
            subject,
            date_label,
            raw_text,
            received_at,
            review_status,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          payment.id,
          payment.customerId ?? null,
          payment.invoiceId ?? null,
          payment.customerName ?? null,
          payment.senderNameRaw ?? null,
          payment.senderEmail ?? null,
          payment.senderPhoneLast4 ?? null,
          Number(payment.amountReceived || 0),
          payment.matchedSignals ?? [],
          Number(payment.score || 0),
          payment.sourceMessageId ?? null,
          payment.subject ?? null,
          payment.dateLabel ?? null,
          payment.rawText ?? null,
          payment.receivedAt ?? null,
          payment.reviewStatus,
        ],
      );
    }

    for (const exception of syncResult.exceptionsToInsert ?? []) {
      await client.query(
        `
          INSERT INTO exceptions (
            id,
            kind,
            sender_name,
            amount,
            expected_amount,
            date_label,
            sender_email,
            sender_phone_last4,
            service_name,
            milestone,
            invoice_id,
            summary,
            alias_name,
            source_message_id,
            status,
            created_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'open', NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          exception.id,
          exception.kind,
          exception.senderName,
          Number(exception.amount || 0),
          exception.expectedAmount === null || exception.expectedAmount === undefined
            ? null
            : Number(exception.expectedAmount),
          exception.dateLabel ?? "",
          exception.senderEmail ?? null,
          exception.senderPhoneLast4 ?? null,
          exception.service ?? null,
          exception.milestone ?? null,
          exception.invoiceId ?? null,
          exception.summary,
          exception.aliasName ?? null,
          exception.sourceMessageId ?? null,
        ],
      );

      for (const [index, candidate] of (exception.candidates ?? []).entries()) {
        await client.query(
          `
            INSERT INTO exception_candidates (
              exception_id,
              customer_id,
              candidate_name,
              note,
              is_primary,
              sort_order
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (exception_id, customer_id)
            DO UPDATE
            SET candidate_name = EXCLUDED.candidate_name,
                note = EXCLUDED.note,
                is_primary = EXCLUDED.is_primary,
                sort_order = EXCLUDED.sort_order
          `,
          [
            exception.id,
            candidate.customerId,
            candidate.name,
            candidate.note,
            Boolean(candidate.primary),
            index,
          ],
        );
      }
    }

    await upsertGmailIntegrationState(client, {
      lastSyncAt: syncResult.syncedAt ?? new Date().toISOString(),
      lastSyncSummary: syncResult.summary ?? null,
    });

    return hydratePortalState(client);
  });
}
