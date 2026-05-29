import fs from "node:fs/promises";
import path from "node:path";
import { createInitialState } from "../../shared/seedState.js";
import { runMigrations } from "./migrations.js";
import { normalizeDigits, normalizeEmail, normalizeName } from "./normalizers.js";
import { withTransaction } from "./pool.js";

const DEFAULT_SEED_SOURCE = path.join(process.cwd(), "server", "storage", "app-state.json");
const DASHBOARD_PERIOD_KEY = "current";

function hasData(value) {
  return value !== null && value !== undefined && value !== "";
}

async function readSeedSource(sourcePath) {
  try {
    const content = await fs.readFile(sourcePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function loadSeedState() {
  const sourcePath = process.env.DB_SEED_SOURCE?.trim() || DEFAULT_SEED_SOURCE;
  return (await readSeedSource(sourcePath)) ?? createInitialState();
}

export async function databaseHasCoreData(client) {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM customers");
  return result.rows[0]?.count > 0;
}

async function truncatePortalTables(client) {
  await client.query(`
    TRUNCATE TABLE
      exception_candidates,
      exceptions,
      payments,
      invoices,
      customer_aliases,
      customer_phones,
      customer_emails,
      customer_services,
      customers,
      activity_events,
      processed_messages,
      integration_states,
      app_sequences,
      dashboard_aging_buckets,
      dashboard_collection_series,
      dashboard_snapshots
    RESTART IDENTITY CASCADE
  `);
}

export async function replaceStateInDatabase(client, state) {
  await truncatePortalTables(client);

  for (const customer of state.customers ?? []) {
    await client.query(
      `
        INSERT INTO customers (id, initials, full_name, normalized_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `,
      [
        customer.id,
        customer.initials,
        customer.name,
        normalizeName(customer.name),
      ],
    );

    for (const service of customer.services ?? []) {
      await client.query(
        `
          INSERT INTO customer_services (customer_id, service_name)
          VALUES ($1, $2)
        `,
        [customer.id, service],
      );
    }

    for (const [index, email] of (customer.emails ?? []).entries()) {
      await client.query(
        `
          INSERT INTO customer_emails (id, customer_id, email, normalized_email, label, is_primary)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          `email-${customer.id}-${index + 1}`,
          customer.id,
          email.value,
          normalizeEmail(email.value),
          email.label ?? null,
          Boolean(email.isPrimary),
        ],
      );
    }

    for (const [index, phone] of (customer.phones ?? []).entries()) {
      const digits = normalizeDigits(phone.value);
      await client.query(
        `
          INSERT INTO customer_phones (id, customer_id, phone_value, normalized_digits, phone_last4, label, is_primary)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          `phone-${customer.id}-${index + 1}`,
          customer.id,
          phone.value,
          digits,
          digits.slice(-4) || "0000",
          phone.label ?? null,
          Boolean(phone.isPrimary),
        ],
      );
    }

    for (const [index, alias] of (customer.aliases ?? []).entries()) {
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
            phone_last4
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          `alias-${customer.id}-${index + 1}`,
          customer.id,
          alias.name,
          normalizeName(alias.name),
          alias.relation ?? null,
          alias.email ?? null,
          alias.email ? normalizeEmail(alias.email) : null,
          alias.phoneLast4 ?? null,
        ],
      );
    }
  }

  for (const invoice of state.invoices ?? []) {
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
        invoice.email ?? null,
        invoice.service,
        invoice.milestone ?? null,
        Number(invoice.baseAmount || 0),
        Number(invoice.discountPct || 0),
        Number(invoice.zelleAmount || 0),
        Number(invoice.cardAmount || 0),
        invoice.dueDate,
        invoice.status,
        invoice.source,
      ],
    );
  }

  for (const payment of state.pendingPayments ?? []) {
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
          date_label,
          received_at,
          review_status,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, 'pending', NOW(), NOW()
        )
      `,
      [
        payment.id,
        payment.customerId ?? null,
        payment.invoiceId ?? null,
        payment.customerName ?? null,
        payment.senderNameRaw ?? payment.customerName ?? null,
        payment.senderEmail ?? null,
        payment.senderPhoneLast4 ?? null,
        Number(payment.amountReceived || 0),
        payment.matchedSignals ?? [],
        Number(payment.score || 0),
        payment.sourceMessageId ?? null,
        payment.dateLabel ?? null,
        payment.receivedAt ?? null,
      ],
    );
  }

  for (const [index, payment] of (state.payments ?? []).entries()) {
    await client.query(
      `
        INSERT INTO payments (
          id,
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
          $1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13, 'history', NOW(), NOW()
        )
      `,
      [
        payment.id ?? `pay-history-${index + 1}`,
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
      ],
    );
  }

  for (const exception of state.exceptions ?? []) {
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
      `,
      [
        exception.id,
        exception.kind,
        exception.senderName,
        Number(exception.amount || 0),
        hasData(exception.expectedAmount) ? Number(exception.expectedAmount) : null,
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

  for (const activity of state.activity ?? []) {
    await client.query(
      `
        INSERT INTO activity_events (id, label, created_at)
        VALUES ($1, $2, NOW())
      `,
      [activity.id, activity.label],
    );
  }

  for (const messageId of state.processedMessageIds ?? []) {
    await client.query(
      `
        INSERT INTO processed_messages (message_id, processed_at)
        VALUES ($1, NOW())
      `,
      [messageId],
    );
  }

  await client.query(
    `
      INSERT INTO app_sequences (sequence_name, next_value)
      VALUES ('invoice', $1)
    `,
    [Number(state.nextInvoiceSequence || 1)],
  );

  await client.query(
    `
      INSERT INTO integration_states (integration_key, state_json, updated_at)
      VALUES ('gmail', $1::jsonb, NOW())
    `,
    [JSON.stringify(state.integrations?.gmail ?? { lastSyncAt: null, lastSyncSummary: null })],
  );

  await client.query(
    `
      INSERT INTO dashboard_snapshots (
        period_key,
        date_label,
        period_label,
        collected,
        outstanding,
        expected,
        auto_match_rate,
        avg_days_to_pay,
        active_customers,
        manual_hours_saved,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    `,
    [
      DASHBOARD_PERIOD_KEY,
      state.dashboard.dateLabel,
      state.dashboard.periodLabel,
      Number(state.dashboard.metrics.collected || 0),
      Number(state.dashboard.metrics.outstanding || 0),
      Number(state.dashboard.metrics.expected || 0),
      state.dashboard.metrics.autoMatchRate ?? "0%",
      state.dashboard.metrics.avgDaysToPay ?? "0",
      Number(state.dashboard.metrics.activeCustomers || 0),
      state.dashboard.metrics.manualHoursSaved ?? "0h",
    ],
  );

  for (const [index, bucket] of (state.dashboard.aging ?? []).entries()) {
    await client.query(
      `
        INSERT INTO dashboard_aging_buckets (period_key, sort_order, label, amount, width, tone)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        DASHBOARD_PERIOD_KEY,
        index,
        bucket.label,
        Number(bucket.amount || 0),
        Number(bucket.width || 0),
        bucket.tone,
      ],
    );
  }

  for (const [index, point] of (state.dashboard.chartData ?? []).entries()) {
    await client.query(
      `
        INSERT INTO dashboard_collection_series (period_key, sort_order, month_label, zelle, stripe)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        DASHBOARD_PERIOD_KEY,
        index,
        point.month,
        Number(point.zelle || 0),
        Number(point.stripe || 0),
      ],
    );
  }
}

export async function seedDatabase({ force = false, seedState } = {}) {
  return withTransaction(async (client) => {
    const hasData = await databaseHasCoreData(client);
    if (hasData && !force) {
      return false;
    }

    await replaceStateInDatabase(client, seedState ?? (await loadSeedState()));
    return true;
  });
}

export async function prepareDatabase() {
  await runMigrations();

  if ((process.env.DB_SEED_ON_BOOT || "true").toLowerCase() === "false") {
    return;
  }

  await seedDatabase();
}
