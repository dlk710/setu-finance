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

function mergeAliases(currentAliases = [], fallbackAliases = []) {
  const aliases = [...currentAliases];
  const seen = new Set(
    aliases.map((alias) =>
      [alias.name ?? "", alias.relation ?? "", alias.email ?? "", alias.phoneLast4 ?? ""].join("|"),
    ),
  );

  for (const alias of fallbackAliases) {
    const key = [alias.name ?? "", alias.relation ?? "", alias.email ?? "", alias.phoneLast4 ?? ""].join("|");
    if (seen.has(key)) {
      continue;
    }
    aliases.push(alias);
    seen.add(key);
  }

  return aliases;
}

function mergeRecordsById(currentRecords = [], fallbackRecords = []) {
  if (!currentRecords?.length) {
    return fallbackRecords ?? [];
  }

  const fallbackById = new Map((fallbackRecords ?? []).map((record) => [record.id, record]));
  return currentRecords.map((record) => {
    const fallbackRecord = fallbackById.get(record.id) ?? {};
    const merged = {
      ...fallbackRecord,
      ...record,
    };

    for (const [key, fallbackValue] of Object.entries(fallbackRecord)) {
      const currentValue = merged[key];
      if (currentValue === null || currentValue === undefined) {
        merged[key] = fallbackValue;
        continue;
      }

      if (Array.isArray(currentValue) && !currentValue.length && Array.isArray(fallbackValue)) {
        merged[key] = fallbackValue;
        continue;
      }

      if (
        currentValue &&
        fallbackValue &&
        typeof currentValue === "object" &&
        !Array.isArray(currentValue) &&
        typeof fallbackValue === "object" &&
        !Array.isArray(fallbackValue)
      ) {
        merged[key] = {
          ...fallbackValue,
          ...currentValue,
        };
      }
    }

    return merged;
  });
}

function enrichSeedState(state) {
  const fallbackState = createInitialState();
  const fallbackCustomers = new Map(fallbackState.customers.map((customer) => [customer.id, customer]));

  return {
    ...state,
    customers: (state.customers ?? []).map((customer) => {
      const fallbackCustomer = fallbackCustomers.get(customer.id);
      return {
        ...customer,
        customerCode: customer.customerCode ?? fallbackCustomer?.customerCode ?? null,
        aliases: mergeAliases(customer.aliases ?? [], fallbackCustomer?.aliases ?? []),
        serviceHistory: customer.serviceHistory ?? fallbackCustomer?.serviceHistory ?? null,
        profile: {
          ...(fallbackCustomer?.profile ?? {}),
          ...(customer.profile ?? {}),
        },
      };
    }),
    pendingPayments: mergeRecordsById(state.pendingPayments, fallbackState.pendingPayments),
    payments: mergeRecordsById(state.payments, fallbackState.payments),
    exceptions: mergeRecordsById(state.exceptions, fallbackState.exceptions),
    admin: {
      ...(fallbackState.admin ?? {}),
      ...(state.admin ?? {}),
    },
  };
}

export async function loadSeedState() {
  const sourcePath = process.env.DB_SEED_SOURCE?.trim() || DEFAULT_SEED_SOURCE;
  return enrichSeedState((await readSeedSource(sourcePath)) ?? createInitialState());
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
      customer_reward_ledger,
      customer_referrals,
      invoices,
      customer_service_enrollments,
      customer_profiles,
      customer_aliases,
      customer_phones,
      customer_emails,
      customer_services,
      customers,
      activity_events,
      processed_messages,
      integration_states,
      system_settings,
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
        INSERT INTO customers (id, customer_code, initials, full_name, normalized_name, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      `,
      [
        customer.id,
        customer.customerCode ?? null,
        customer.initials,
        customer.name,
        normalizeName(customer.name),
      ],
    );

    const serviceHistory = customer.serviceHistory?.length
      ? customer.serviceHistory
      : (customer.services ?? []).map((service, index) => ({
          id: `svc-${customer.id}-${index + 1}`,
          name: service,
          code: null,
          isCustom: false,
          enrolledAt: customer.profile?.onboardedAt ?? new Date().toISOString(),
        }));

    for (const [index, service] of serviceHistory.entries()) {
      await client.query(
        `
          INSERT INTO customer_service_enrollments (
            id,
            customer_id,
            service_name,
            service_code,
            is_custom,
            enrolled_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, NOW())
        `,
        [
          service.id ?? `svc-${customer.id}-${index + 1}`,
          customer.id,
          service.name,
          service.code ?? null,
          Boolean(service.isCustom),
          service.enrolledAt ?? customer.profile?.onboardedAt ?? new Date().toISOString(),
        ],
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

    const profile = customer.profile ?? {};
    await client.query(
      `
        INSERT INTO customer_profiles (
          customer_id,
          onboarding_status,
          intake_source,
          preferred_payment_method,
          billing_cadence,
          referral_source,
          billing_notes,
          home_address_line1,
          home_address_line2,
          home_city,
          home_state,
          home_postal_code,
          home_country,
          onboarded_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          COALESCE($14::timestamptz, NOW()),
          NOW()
        )
      `,
      [
        customer.id,
        profile.onboardingStatus ?? "complete",
        profile.intakeSource ?? "seed",
        profile.preferredPaymentMethod ?? "zelle",
        profile.billingCadence ?? "per_milestone",
        profile.referralSource ?? null,
        profile.billingNotes ?? null,
        profile.homeAddressLine1 ?? null,
        profile.homeAddressLine2 ?? null,
        profile.homeCity ?? null,
        profile.homeState ?? null,
        profile.homePostalCode ?? null,
        profile.homeCountry ?? null,
        profile.onboardedAt ?? null,
      ],
    );
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
          source_provider,
          source_thread_id,
          message_from_email,
          message_to_email,
          message_date_header,
          transaction_date,
          subject,
          transaction_reference,
          memo,
          parsed_payload,
          match_status,
          match_summary,
          date_label,
          raw_text,
          received_at,
          review_status,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23, $24, $25, $26, $27, NOW(), NOW()
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
        payment.sourceProvider ?? "gmail",
        payment.sourceThreadId ?? null,
        payment.messageFromEmail ?? null,
        payment.messageToEmail ?? null,
        payment.messageDateHeader ?? null,
        payment.transactionDate ?? null,
        payment.subject ?? null,
        payment.transactionReference ?? null,
        payment.memo ?? null,
        JSON.stringify(payment.parsedPayload ?? {}),
        payment.matchStatus ?? "matched",
        payment.matchSummary ?? null,
        payment.dateLabel ?? null,
        payment.rawText ?? null,
        payment.receivedAt ?? null,
        payment.reviewStatus ?? "pending",
      ],
    );
  }

  for (const [index, payment] of (state.payments ?? []).entries()) {
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
          source_provider,
          source_thread_id,
          message_from_email,
          message_to_email,
          message_date_header,
          transaction_date,
          subject,
          transaction_reference,
          memo,
          parsed_payload,
          match_status,
          match_summary,
          date_label,
          raw_text,
          received_at,
          applied_at,
          receipt_sent_to_email,
          receipt_sent_at,
          review_status,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW(), NOW()
        )
      `,
      [
        payment.id ?? `pay-history-${index + 1}`,
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
        payment.sourceProvider ?? "gmail",
        payment.sourceThreadId ?? null,
        payment.messageFromEmail ?? null,
        payment.messageToEmail ?? null,
        payment.messageDateHeader ?? null,
        payment.transactionDate ?? null,
        payment.subject ?? null,
        payment.transactionReference ?? null,
        payment.memo ?? null,
        JSON.stringify(payment.parsedPayload ?? {}),
        payment.matchStatus ?? "applied",
        payment.matchSummary ?? null,
        payment.dateLabel ?? null,
        payment.rawText ?? null,
        payment.receivedAt ?? null,
        payment.appliedAt ?? null,
        payment.receiptSentToEmail ?? null,
        payment.receiptSentAt ?? null,
        payment.reviewStatus ?? "history",
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
      INSERT INTO app_sequences (sequence_name, next_value)
      VALUES ('customer', $1)
      ON CONFLICT (sequence_name)
      DO UPDATE
      SET next_value = EXCLUDED.next_value
    `,
    [
      (state.customers ?? []).reduce((max, customer) => {
        const numeric = Number(String(customer.customerCode ?? "").replace(/\D/g, ""));
        return Number.isFinite(numeric) ? Math.max(max, numeric + 1) : max;
      }, 1),
    ],
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
      INSERT INTO system_settings (setting_key, setting_json, updated_at)
      VALUES ('referral_program', $1::jsonb, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE
      SET setting_json = EXCLUDED.setting_json,
          updated_at = NOW()
    `,
    [
      JSON.stringify(
        state.admin?.referralProgram ?? {
          enabled: true,
          bonusAmount: 500,
          qualifyingPaidAmount: 3000,
          qualificationMonths: 6,
        },
      ),
    ],
  );

  for (const referral of state.admin?.referrals ?? []) {
    await client.query(
      `
        INSERT INTO customer_referrals (
          id,
          referrer_customer_id,
          referred_customer_id,
          status,
          bonus_amount,
          qualifying_paid_amount,
          qualifying_months,
          program_snapshot,
          notes,
          qualified_at,
          awarded_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, NOW()
        )
      `,
      [
        referral.id,
        referral.referrerCustomerId,
        referral.referredCustomerId,
        referral.status ?? "active",
        Number(referral.bonusAmount || 0),
        Number(referral.qualifyingPaidAmount || 0),
        Number(referral.qualifyingMonths || 0),
        JSON.stringify(state.admin?.referralProgram ?? {}),
        referral.notes ?? null,
        referral.qualifiedAt ?? null,
        referral.awardedAt ?? null,
        referral.createdAt ?? new Date().toISOString(),
      ],
    );
  }

  for (const reward of state.admin?.rewards ?? []) {
    await client.query(
      `
        INSERT INTO customer_reward_ledger (
          id,
          customer_id,
          referral_id,
          reward_type,
          status,
          amount,
          description,
          earned_at,
          applied_at,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
      `,
      [
        reward.id,
        reward.customerId,
        reward.referralId ?? null,
        reward.rewardType ?? "referral_bonus",
        reward.status ?? "available",
        Number(reward.amount || 0),
        reward.description ?? null,
        reward.earnedAt ?? new Date().toISOString(),
        reward.appliedAt ?? null,
      ],
    );
  }

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
