import {
  createInvoiceRefPreview,
  makeCustomerCode,
  normalizeCustomerCode,
  normalizeInvoiceCode,
} from "../shared/seedState.js";
import { describeService, normalizeServiceLabel } from "../shared/serviceCatalog.js";
import { prepareDatabase } from "./db/seed.js";
import { buildInitials, normalizeDigits, normalizeEmail, normalizeName } from "./db/normalizers.js";
import { withTransaction } from "./db/pool.js";
import { loadStoredContractBinary, storeContractBinary } from "./services/contractStorage.js";
import {
  normalizeGmailAutoSyncSettings,
  normalizeGmailIntegrationState,
} from "./services/gmailSyncSettings.js";
import { matchPaymentToState } from "./services/matching.js";

const DASHBOARD_PERIOD_KEY = "current";
const DEFAULT_REFERRAL_PROGRAM = {
  enabled: true,
  programName: "Standard referral program",
  programDescription:
    "Referral bonuses are earned when the referred client reaches the payment or time threshold, then applied as a discount on the referrer's next eligible draft invoice.",
  bonusAmount: 500,
  qualifyingPaidAmount: 3000,
  qualificationMonths: 6,
};

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculateZelleAmount(amount, discountPct) {
  return roundCurrency(Number(amount || 0) * (1 - Number(discountPct || 0) / 100));
}

function calculateInvoiceAmounts(baseAmount, discountPct, referralBonusAmount = 0) {
  const roundedBaseAmount = roundCurrency(baseAmount);
  const roundedReferralBonusAmount = roundCurrency(referralBonusAmount);
  return {
    baseAmount: roundedBaseAmount,
    referralBonusAmount: roundedReferralBonusAmount,
    zelleAmount: Math.max(0, roundCurrency(calculateZelleAmount(roundedBaseAmount, discountPct) - roundedReferralBonusAmount)),
    cardAmount: Math.max(0, roundCurrency(roundedBaseAmount - roundedReferralBonusAmount)),
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function createCustomerCodePreview(sequence) {
  return makeCustomerCode(sequence);
}

function normalizeLegacyIdentifierText(text) {
  if (!text) {
    return text;
  }

  return String(text)
    .replace(/\bCUS-(\d+)\b/g, (_, digits) => normalizeCustomerCode(`CUS-${digits}`) ?? `CUS-${digits}`)
    .replace(/\bASC-\d{4}-(\d+)\b/g, (_, digits) =>
      normalizeInvoiceCode(`ASC-2026-${digits}`) ?? `ASC-2026-${digits}`,
    );
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

function formatDateOnlyOutput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function getContractMetaValue(contractLike, key) {
  return (
    contractLike?.[key] ??
    contractLike?.parsed?.[key] ??
    contractLike?.criticalFields?.[key] ??
    contractLike?.parsed_fields?.[key] ??
    null
  );
}

function getContractPrefillRank(contractLike) {
  return Number(getContractMetaValue(contractLike, "prefillRank") || 0) || 0;
}

function selectPreferredContract(contracts = [], { requireBilling = false, requireProfile = false } = {}) {
  const filtered = (Array.isArray(contracts) ? contracts : []).filter((contract) => {
    if (requireBilling && !Boolean(getContractMetaValue(contract, "prefillBilling"))) {
      return false;
    }
    if (requireProfile && !Boolean(getContractMetaValue(contract, "prefillProfile"))) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    const rankDiff = getContractPrefillRank(right) - getContractPrefillRank(left);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    const rightTime = new Date(
      right?.uploadedAt ??
        right?.created_at ??
        getContractMetaValue(right, "contractDate") ??
        getContractMetaValue(right, "serviceStartDate") ??
        0,
    ).getTime();
    const leftTime = new Date(
      left?.uploadedAt ??
        left?.created_at ??
        getContractMetaValue(left, "contractDate") ??
        getContractMetaValue(left, "serviceStartDate") ??
        0,
    ).getTime();
    return rightTime - leftTime;
  })[0] ?? null;
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoiceCode: normalizeInvoiceCode(row.invoice_code) ?? row.invoice_code,
    customerId: row.customer_id,
    customerName: row.customer_name,
    email: row.delivery_email,
    service: row.service_name,
    milestone: row.milestone,
    baseAmount: Number(row.base_amount || 0),
    discountPct: Number(row.discount_pct || 0),
    referralBonusAmount: Number(row.referral_bonus_amount || 0),
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
    customerCode:
      normalizeCustomerCode(row.customer_code ?? row.resolved_customer_code ?? null) ??
      row.customer_code ??
      row.resolved_customer_code ??
      null,
    matchedSignals: row.matched_signals ?? [],
    score: Number(row.score || 0),
    amountReceived: Number(row.amount_received || 0),
    invoiceId: row.invoice_id ?? null,
    matchedInvoiceCode: normalizeInvoiceCode(row.matched_invoice_code) ?? row.matched_invoice_code ?? null,
    sourceMessageId: row.source_message_id ?? null,
    sourceProvider: row.source_provider ?? "gmail",
    sourceThreadId: row.source_thread_id ?? null,
    messageFromEmail: row.message_from_email ?? null,
    messageToEmail: row.message_to_email ?? null,
    messageDateHeader: row.message_date_header ?? null,
    transactionDate: row.transaction_date ?? null,
    senderEmail: row.sender_email ?? null,
    senderPhoneLast4: row.sender_phone_last4 ?? null,
    senderNameRaw: row.sender_name_raw ?? null,
    subject: row.subject ?? null,
    transactionReference: row.transaction_reference ?? null,
    memo: row.memo ?? null,
    parsedPayload: row.parsed_payload ?? {},
    matchStatus: row.match_status ?? "pending_review",
    matchSummary: normalizeLegacyIdentifierText(row.match_summary ?? null),
    reviewNotes: row.review_notes ?? null,
    dateLabel: row.date_label ?? null,
    rawText: row.raw_text ?? null,
    receivedAt: formatTimestamp(row.received_at),
    appliedAt: formatTimestamp(row.applied_at),
    duplicateOfPaymentId: row.duplicate_of_payment_id ?? null,
    receiptSentToEmail: row.receipt_sent_to_email ?? null,
    receiptSentAt: formatTimestamp(row.receipt_sent_at),
    reviewStatus: row.review_status,
  };
}

function mapExceptionHistoryRow(row) {
  return {
    id: row.id,
    exceptionId: row.exception_id,
    kind: row.exception_kind,
    senderName: row.sender_name,
    amount: Number(row.amount || 0),
    expectedAmount:
      row.expected_amount === null || row.expected_amount === undefined
        ? null
        : Number(row.expected_amount),
    dateLabel: row.date_label,
    senderEmail: row.sender_email ?? null,
    senderPhoneLast4: row.sender_phone_last4 ?? null,
    service: row.service_name ?? null,
    milestone: row.milestone ?? null,
    invoiceId: row.invoice_id ?? null,
    matchedInvoiceCode: normalizeInvoiceCode(row.invoice_code) ?? row.invoice_code ?? null,
    summary: row.summary,
    aliasName: row.alias_name ?? null,
    sourceMessageId: row.source_message_id ?? null,
    sourceProvider: row.source_provider ?? "gmail",
    transactionReference: row.transaction_reference ?? null,
    memo: row.memo ?? null,
    matchedSignals: row.matched_signals ?? [],
    score: Number(row.score || 0),
    resolutionAction: row.resolution_action,
    resolutionMessage: row.resolution_message ?? null,
    resolvedByUsername: row.resolved_by_username ?? null,
    resolvedCustomerId: row.resolved_customer_id ?? null,
    resolvedCustomerName: row.resolved_customer_name ?? null,
    resolvedCustomerCode:
      normalizeCustomerCode(row.resolved_customer_code) ?? row.resolved_customer_code ?? null,
    resolvedPaymentId: row.resolved_payment_id ?? null,
    resolvedAt: formatTimestamp(row.resolved_at),
    originalExceptionCreatedAt: formatTimestamp(row.original_exception_created_at),
  };
}

function mapReferralSubmissionRow(row, customerMap) {
  const referrer = customerMap.get(row.referrer_customer_id);
  const matchedCustomer =
    customerMap.get(row.matched_customer_id) ??
    customerMap.get(row.converted_customer_id) ??
    null;
  const convertedCustomer = customerMap.get(row.converted_customer_id);

  return {
    id: row.id,
    referrerCustomerId: row.referrer_customer_id,
    referrerCustomerName: referrer?.name ?? "Unknown customer",
    referrerCustomerCode: referrer?.customerCode ?? null,
    referrerEmail: row.referrer_email,
    referredFullName: row.referred_full_name,
    referredEmail: row.referred_email,
    referredPhone: row.referred_phone ?? null,
    relationshipLabel: row.relationship_label ?? null,
    notes: row.notes ?? null,
    source: row.source ?? "public_form",
    status: row.status,
    submittedAt: formatTimestamp(row.submitted_at ?? row.created_at),
    matchedCustomerId: matchedCustomer?.id ?? row.matched_customer_id ?? null,
    matchedCustomerName: matchedCustomer?.name ?? null,
    matchedCustomerCode:
      normalizeCustomerCode(matchedCustomer?.customerCode ?? row.matched_customer_code) ??
      matchedCustomer?.customerCode ??
      row.matched_customer_code ??
      null,
    convertedCustomerId: convertedCustomer?.id ?? row.converted_customer_id ?? null,
    convertedCustomerName: convertedCustomer?.name ?? null,
    convertedCustomerCode:
      normalizeCustomerCode(convertedCustomer?.customerCode ?? row.converted_customer_code) ??
      convertedCustomer?.customerCode ??
      row.converted_customer_code ??
      null,
    convertedReferralId: row.converted_referral_id ?? null,
    convertedAt: formatTimestamp(row.converted_at),
    dismissedAt: formatTimestamp(row.dismissed_at),
    reviewedByUsername: row.reviewed_by_username ?? null,
    reviewNotes: row.review_notes ?? null,
  };
}

function normalizeReferralProgramConfig(config = {}) {
  const programName = String(config.programName ?? DEFAULT_REFERRAL_PROGRAM.programName).trim();
  const programDescription = String(
    config.programDescription ?? DEFAULT_REFERRAL_PROGRAM.programDescription,
  ).trim();
  const bonusAmount = Number(config.bonusAmount ?? DEFAULT_REFERRAL_PROGRAM.bonusAmount);
  const qualifyingPaidAmount = Number(
    config.qualifyingPaidAmount ?? DEFAULT_REFERRAL_PROGRAM.qualifyingPaidAmount,
  );
  const qualificationMonths = Number(
    config.qualificationMonths ?? DEFAULT_REFERRAL_PROGRAM.qualificationMonths,
  );

  return {
    enabled: config.enabled !== false,
    programName: programName || DEFAULT_REFERRAL_PROGRAM.programName,
    programDescription: programDescription || DEFAULT_REFERRAL_PROGRAM.programDescription,
    bonusAmount: Number.isFinite(bonusAmount)
      ? Math.max(0, Math.round(bonusAmount * 100) / 100)
      : DEFAULT_REFERRAL_PROGRAM.bonusAmount,
    qualifyingPaidAmount: Number.isFinite(qualifyingPaidAmount)
      ? Math.max(0, Math.round(qualifyingPaidAmount * 100) / 100)
      : DEFAULT_REFERRAL_PROGRAM.qualifyingPaidAmount,
    qualificationMonths: Number.isFinite(qualificationMonths)
      ? Math.max(0, Math.round(qualificationMonths))
      : DEFAULT_REFERRAL_PROGRAM.qualificationMonths,
  };
}

function findPrimaryEmail(customer) {
  return (
    customer?.emails.find((email) => email.isPrimary)?.value ??
    customer?.emails[0]?.value ??
    null
  );
}

function normalizeTransactionReference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeDateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value);
  if (raw.includes("T")) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function sameSenderIdentity(left, right) {
  const leftEmail = normalizeEmail(left.sender_email ?? left.senderEmail ?? null);
  const rightEmail = normalizeEmail(right.sender_email ?? right.senderEmail ?? null);
  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    return true;
  }

  const leftPhone = String(left.sender_phone_last4 ?? left.senderPhoneLast4 ?? "").trim();
  const rightPhone = String(right.sender_phone_last4 ?? right.senderPhoneLast4 ?? "").trim();
  if (leftPhone && rightPhone && leftPhone === rightPhone) {
    return true;
  }

  const leftName = normalizeName(left.sender_name_raw ?? left.senderNameRaw ?? null);
  const rightName = normalizeName(right.sender_name_raw ?? right.senderNameRaw ?? null);
  if (!leftName || !rightName) {
    return false;
  }

  if (leftName === rightName) {
    return true;
  }

  const leftParts = leftName.split(" ").filter(Boolean);
  const rightParts = rightName.split(" ").filter(Boolean);
  if (leftParts.length < 2 || rightParts.length < 2) {
    return false;
  }

  return leftParts.at(-1) === rightParts.at(-1) && leftParts[0][0] === rightParts[0][0];
}

function buildDuplicateSummary(existingPayment) {
  const destination = existingPayment.matchedInvoiceCode
    ? `${existingPayment.customerCode ?? existingPayment.customerId ?? "Customer"} · ${
        existingPayment.matchedInvoiceCode
      }`
    : existingPayment.customerCode ?? existingPayment.customerId ?? existingPayment.customerName ?? "customer record";
  const reference = existingPayment.transactionReference
    ? ` Transaction ref ${existingPayment.transactionReference} was already applied.`
    : "";
  return `Potential duplicate payment blocked.${reference} Existing applied payment: ${destination}.`;
}

function createEmptyCustomerProfile(overrides = {}) {
  return {
    onboardingStatus: "needs_follow_up",
    intakeSource: "invoice",
    preferredPaymentMethod: "zelle",
    feeType: "one_time",
    billingCadence: "per_milestone",
    referralSource: null,
    referralRelationshipLabel: null,
    billingNotes: null,
    onboardedAt: null,
    serviceStartDate: null,
    referredByCustomerId: null,
    homeAddressLine1: null,
    homeAddressLine2: null,
    homeCity: null,
    homeState: null,
    homePostalCode: null,
    homeCountry: null,
    ...overrides,
  };
}

function mapCustomerProfileRow(row) {
  return createEmptyCustomerProfile({
    onboardingStatus: row.onboarding_status,
    intakeSource: row.intake_source,
    preferredPaymentMethod: row.preferred_payment_method,
    feeType: row.fee_type,
    billingCadence: row.billing_cadence,
    referralSource: row.referral_source ?? null,
    billingNotes: row.billing_notes ?? null,
    onboardedAt: formatTimestamp(row.onboarded_at),
    serviceStartDate: formatDateOnlyOutput(row.service_start_date),
    homeAddressLine1: row.home_address_line1 ?? null,
    homeAddressLine2: row.home_address_line2 ?? null,
    homeCity: row.home_city ?? null,
    homeState: row.home_state ?? null,
    homePostalCode: row.home_postal_code ?? null,
    homeCountry: row.home_country ?? null,
  });
}

function normalizeServiceName(value) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalizeServiceLabel(normalized);
}

function normalizeServiceEntries(serviceEntries = [], fallbackService = null, fallbackEnrolledAt = null) {
  const rawEntries = Array.isArray(serviceEntries) ? serviceEntries : [];
  const normalized = rawEntries
    .map((entry) => {
      const name = normalizeServiceName(entry?.name);
      if (!name) {
        return null;
      }

      return {
        name,
        code: entry?.code ? String(entry.code).trim() : describeService(name).code ?? null,
        isCustom: entry?.isCustom ?? describeService(name).isCustom,
        enrolledAt: formatTimestamp(entry?.enrolledAt || fallbackEnrolledAt || new Date()),
      };
    })
    .filter(Boolean);

  if (!normalized.length && fallbackService) {
    const name = normalizeServiceName(fallbackService);
    if (name) {
      normalized.push({
        name,
        code: null,
        isCustom: false,
        enrolledAt: formatTimestamp(fallbackEnrolledAt || new Date()),
      });
    }
  }

  return normalized;
}

function appendServiceSummary(customer, serviceName) {
  if (!serviceName) {
    return;
  }

  const normalizedServiceName = normalizeServiceLabel(serviceName);
  if (!customer.services.includes(normalizedServiceName)) {
    customer.services.push(normalizedServiceName);
  }
}

function mapServiceEnrollmentRow(row) {
  return {
    id: row.id,
    name: normalizeServiceLabel(row.service_name),
    code: row.service_code ?? describeService(row.service_name).code ?? null,
    isCustom: row.is_custom,
    enrolledAt: formatTimestamp(row.enrolled_at),
  };
}

function mapContractRow(row) {
  const criticalFields = row.critical_fields ?? {};
  const parsedFields = row.parsed_fields ?? {};
  const services = Array.isArray(criticalFields.services)
    ? criticalFields.services.map((service) => {
        const description = describeService(service.name ?? service.shortLabel ?? service.longLabel ?? service);
        return {
          code: service.code ?? description.code,
          name: description.shortLabel,
          longLabel: service.longLabel ?? description.longLabel,
          isCustom: service.isCustom ?? description.isCustom,
        };
      })
    : [];
  const installments = Array.isArray(criticalFields.installments)
    ? criticalFields.installments.map((entry) => ({
        label: entry.label ?? entry.milestone ?? "Installment",
        serviceName: normalizeServiceLabel(entry.serviceName ?? entry.service ?? "General service"),
        milestone: entry.milestone ?? entry.label ?? null,
        amount: Number(entry.amount || 0),
        discountPct: Number(entry.discountPct || 0),
        dueDate: entry.dueDate ?? null,
      }))
    : [];

  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes || 0),
    storageProvider: row.storage_provider,
    uploadedByUsername: row.uploaded_by_username ?? null,
    uploadedAt: formatTimestamp(row.created_at),
    contractDate: formatDateOnlyOutput(row.contract_date),
    serviceStartDate: formatDateOnlyOutput(row.service_start_date),
    totalFee: row.total_fee === null || row.total_fee === undefined ? null : Number(row.total_fee),
    installmentCount: Number(row.installment_count || installments.length || 0),
    contractKind: parsedFields.contractKind ?? criticalFields.contractKind ?? null,
    contractKindLabel: parsedFields.contractKindLabel ?? criticalFields.contractKindLabel ?? null,
    prefillProfile: Boolean(parsedFields.prefillProfile ?? criticalFields.prefillProfile),
    prefillBilling: Boolean(parsedFields.prefillBilling ?? criticalFields.prefillBilling),
    prefillRank: Number(parsedFields.prefillRank ?? criticalFields.prefillRank ?? 0) || 0,
    extractedTextPreview: row.extracted_text_preview ?? null,
    services,
    installments,
    downloadPath: `/api/contracts/${row.id}/download`,
  };
}

async function ensureUniqueCustomerIdentity(client, { customerEmail, customerPhone, ignoreCustomerId = null }) {
  const normalizedEmail = normalizeEmail(customerEmail || "");
  if (normalizedEmail) {
    const emailResult = await client.query(
      `
        SELECT customer_id
        FROM customer_emails
        WHERE normalized_email = $1
          AND ($2::text IS NULL OR customer_id <> $2::text)
        LIMIT 1
      `,
      [normalizedEmail, ignoreCustomerId],
    );

    if (emailResult.rowCount) {
      throw new Error("A customer already exists with this primary email.");
    }
  }

  const normalizedDigits = normalizeDigits(customerPhone || "");
  if (normalizedDigits) {
    const phoneResult = await client.query(
      `
        SELECT customer_id
        FROM customer_phones
        WHERE normalized_digits = $1
          AND ($2::text IS NULL OR customer_id <> $2::text)
        LIMIT 1
      `,
      [normalizedDigits, ignoreCustomerId],
    );

    if (phoneResult.rowCount) {
      throw new Error("A customer already exists with this phone number.");
    }
  }
}

async function upsertCustomerProfile(client, customerId, profile) {
  const normalizedProfile = createEmptyCustomerProfile(profile);

  await client.query(
    `
      INSERT INTO customer_profiles (
        customer_id,
        onboarding_status,
        intake_source,
        preferred_payment_method,
        fee_type,
        billing_cadence,
        referral_source,
        billing_notes,
        service_start_date,
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12, $13, $14, $15,
        COALESCE($16::timestamptz, NOW()),
        NOW()
      )
      ON CONFLICT (customer_id)
      DO UPDATE
      SET onboarding_status = EXCLUDED.onboarding_status,
          intake_source = EXCLUDED.intake_source,
          preferred_payment_method = EXCLUDED.preferred_payment_method,
          fee_type = EXCLUDED.fee_type,
          billing_cadence = EXCLUDED.billing_cadence,
          referral_source = EXCLUDED.referral_source,
          billing_notes = EXCLUDED.billing_notes,
          service_start_date = EXCLUDED.service_start_date,
          home_address_line1 = EXCLUDED.home_address_line1,
          home_address_line2 = EXCLUDED.home_address_line2,
          home_city = EXCLUDED.home_city,
          home_state = EXCLUDED.home_state,
          home_postal_code = EXCLUDED.home_postal_code,
          home_country = EXCLUDED.home_country,
          onboarded_at = EXCLUDED.onboarded_at,
          updated_at = NOW()
    `,
    [
      customerId,
      normalizedProfile.onboardingStatus,
      normalizedProfile.intakeSource,
      normalizedProfile.preferredPaymentMethod,
      normalizedProfile.feeType,
      normalizedProfile.billingCadence,
      normalizedProfile.referralSource,
      normalizedProfile.billingNotes,
      normalizedProfile.serviceStartDate,
      normalizedProfile.homeAddressLine1,
      normalizedProfile.homeAddressLine2,
      normalizedProfile.homeCity,
      normalizedProfile.homeState,
      normalizedProfile.homePostalCode,
      normalizedProfile.homeCountry,
      normalizedProfile.onboardedAt,
    ],
  );
}

async function upsertPrimaryEmail(client, customerId, email) {
  const normalizedEmail = normalizeEmail(email || "");
  if (!normalizedEmail) {
    return;
  }

  const existingResult = await client.query(
    `
      SELECT id
      FROM customer_emails
      WHERE customer_id = $1
        AND is_primary = TRUE
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [customerId],
  );

  if (existingResult.rowCount) {
    await client.query(
      `
        UPDATE customer_emails
        SET email = $2,
            normalized_email = $3,
            label = 'primary',
            is_primary = TRUE
        WHERE id = $1
      `,
      [existingResult.rows[0].id, email, normalizedEmail],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO customer_emails (id, customer_id, email, normalized_email, label, is_primary)
      VALUES ($1, $2, $3, $4, 'primary', TRUE)
    `,
    [`email-${customerId}-${crypto.randomUUID()}`, customerId, email, normalizedEmail],
  );
}

async function upsertPrimaryPhone(client, customerId, phone) {
  const normalizedDigits = normalizeDigits(phone || "");
  if (!normalizedDigits) {
    return;
  }

  const existingResult = await client.query(
    `
      SELECT id
      FROM customer_phones
      WHERE customer_id = $1
        AND is_primary = TRUE
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [customerId],
  );

  if (existingResult.rowCount) {
    await client.query(
      `
        UPDATE customer_phones
        SET phone_value = $2,
            normalized_digits = $3,
            phone_last4 = $4,
            label = 'mobile',
            is_primary = TRUE
        WHERE id = $1
      `,
      [existingResult.rows[0].id, phone, normalizedDigits, normalizedDigits.slice(-4) || "0000"],
    );
    return;
  }

  await client.query(
    `
      INSERT INTO customer_phones (id, customer_id, phone_value, normalized_digits, phone_last4, label, is_primary)
      VALUES ($1, $2, $3, $4, $5, 'mobile', TRUE)
    `,
    [
      `phone-${customerId}-${crypto.randomUUID()}`,
      customerId,
      phone,
      normalizedDigits,
      normalizedDigits.slice(-4) || "0000",
    ],
  );
}

async function insertServiceEnrollments(client, customerId, serviceEntries) {
  const normalizedEntries = normalizeServiceEntries(serviceEntries);

  for (const entry of normalizedEntries) {
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
        `svc-${customerId}-${crypto.randomUUID()}`,
        customerId,
        entry.name,
        entry.code,
        entry.isCustom,
        entry.enrolledAt,
      ],
    );
  }
}

function normalizeDateInput(value, fallbackValue = null) {
  if (!value && !fallbackValue) {
    return null;
  }

  const candidate = value || fallbackValue;
  const parsed =
    candidate instanceof Date
      ? candidate
      : new Date(String(candidate).includes("T") ? String(candidate) : `${candidate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeInvoiceScheduleEntries(
  scheduleEntries = [],
  serviceEntries = [],
  fallbackServiceStartDate = null,
) {
  const defaultServiceName = serviceEntries[0]?.name ?? "General service";
  return (Array.isArray(scheduleEntries) ? scheduleEntries : [])
    .map((entry, index) => {
      const amount = Number(entry?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      const serviceName = normalizeServiceName(
        entry?.serviceName ?? entry?.service ?? defaultServiceName,
      );
      const milestone = String(
        entry?.milestone ?? entry?.label ?? `Installment ${index + 1}`,
      )
        .replace(/\s+/g, " ")
        .trim();

      return {
        label: milestone,
        serviceName: serviceName || defaultServiceName,
        milestone,
        amount: Math.round(amount * 100) / 100,
        discountPct: Number(entry?.discountPct || 0) || 0,
        dueDate:
          normalizeDateInput(entry?.dueDate, fallbackServiceStartDate) ??
          normalizeDateInput(new Date()),
      };
    })
    .filter(Boolean);
}

function normalizeContractUploads(contractUploads = []) {
  return (Array.isArray(contractUploads) ? contractUploads : [])
    .map((contractUpload) => {
      const fileName = String(contractUpload?.fileName || "").trim();
      const mimeType = String(contractUpload?.mimeType || "application/octet-stream").trim();
      const contentBase64 = String(contractUpload?.contentBase64 || "").trim();
      if (!fileName || !contentBase64) {
        return null;
      }

      const normalizedBase64 = contentBase64.includes(",")
        ? contentBase64.slice(contentBase64.indexOf(",") + 1)
        : contentBase64;
      const buffer = Buffer.from(normalizedBase64, "base64");
      if (!buffer.length) {
        return null;
      }

      return {
        fileName,
        mimeType,
        buffer,
        parsed: contractUpload?.parsed ?? {},
        extractedTextPreview: String(contractUpload?.extractedTextPreview || "").trim() || null,
      };
    })
    .filter(Boolean);
}

async function insertContractRecords(
  client,
  { customerId, customerCode, contractUploads, uploadedByUsername = null },
) {
  const normalizedUploads = normalizeContractUploads(contractUploads);
  const insertedContracts = [];

  for (const contractUpload of normalizedUploads) {
    const uploadedAt = new Date();
    const storeResult = await storeContractBinary({
      customerCode,
      fileName: contractUpload.fileName,
      mimeType: contractUpload.mimeType,
      buffer: contractUpload.buffer,
      uploadedAt,
    });

    const parsedServices = normalizeServiceEntries(
      (contractUpload.parsed?.services ?? []).map((service) => ({
        name: service.name ?? service.shortLabel ?? service.longLabel ?? service,
        code: service.code ?? null,
        isCustom: service.isCustom ?? false,
        enrolledAt: contractUpload.parsed?.serviceStartDate ?? uploadedAt.toISOString(),
      })),
    ).map((service) => ({
      code: service.code,
      name: service.name,
      longLabel: describeService(service.name).longLabel,
      isCustom: service.isCustom,
    }));

    const parsedInstallments = normalizeInvoiceScheduleEntries(
      contractUpload.parsed?.installments ?? [],
      parsedServices,
      contractUpload.parsed?.serviceStartDate ?? null,
    );
    const totalFee =
      Number(contractUpload.parsed?.totalFee || 0) ||
      (parsedInstallments.length
        ? Math.round(
            parsedInstallments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) * 100,
          ) / 100
        : null);

    const contractId = `contract-${crypto.randomUUID()}`;
    const criticalFields = {
      contractKind: contractUpload.parsed?.contractKind ?? null,
      contractKindLabel: contractUpload.parsed?.contractKindLabel ?? null,
      prefillProfile: Boolean(contractUpload.parsed?.prefillProfile),
      prefillBilling: Boolean(contractUpload.parsed?.prefillBilling),
      prefillRank: Number(contractUpload.parsed?.prefillRank || 0) || 0,
      clientName: contractUpload.parsed?.clientName ?? null,
      customerEmail: contractUpload.parsed?.customerEmail ?? null,
      customerPhone: contractUpload.parsed?.customerPhone ?? null,
      contractDate: normalizeDateInput(contractUpload.parsed?.contractDate),
      serviceStartDate: normalizeDateInput(contractUpload.parsed?.serviceStartDate),
      totalFee,
      services: parsedServices,
      installments: parsedInstallments,
      billingCadence: contractUpload.parsed?.billingCadence ?? "",
    };

    await client.query(
      `
        INSERT INTO customer_contracts (
          id,
          customer_id,
          file_name,
          mime_type,
          file_size_bytes,
          storage_provider,
          storage_key,
          extracted_text_preview,
          contract_date,
          service_start_date,
          total_fee,
          installment_count,
          parsed_fields,
          critical_fields,
          uploaded_by_username,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13::jsonb, $14::jsonb, $15, NOW(), NOW()
        )
      `,
      [
        contractId,
        customerId,
        contractUpload.fileName,
        contractUpload.mimeType,
        contractUpload.buffer.length,
        storeResult.storageProvider,
        storeResult.storageKey,
        contractUpload.extractedTextPreview,
        criticalFields.contractDate,
        criticalFields.serviceStartDate,
        totalFee,
        parsedInstallments.length,
        JSON.stringify(contractUpload.parsed ?? {}),
        JSON.stringify(criticalFields),
        uploadedByUsername,
      ],
    );

    insertedContracts.push({
      id: contractId,
      ...criticalFields,
      uploadedAt: uploadedAt.toISOString(),
    });
  }

  return insertedContracts;
}

async function insertContractInvoiceSchedule(
  client,
  { customerId, customerName, customerEmail, scheduleEntries },
) {
  const normalizedSchedule = normalizeInvoiceScheduleEntries(scheduleEntries);
  const createdInvoices = [];

  for (const entry of normalizedSchedule) {
    const { invoiceCode } = await reserveNextInvoiceCode(client);
    const invoiceId = `inv-${crypto.randomUUID()}`;
    const baseAmount = roundCurrency(entry.amount);
    const discountPct = Number(entry.discountPct || 0) || 0;
    const invoiceAmounts = calculateInvoiceAmounts(baseAmount, discountPct, 0);

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
          referral_bonus_amount,
          zelle_amount,
          card_amount,
          due_date,
          status,
          source,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', 'contract', NOW(), NOW())
      `,
      [
        invoiceId,
        invoiceCode,
        customerId,
        customerEmail ?? null,
        normalizeServiceName(entry.serviceName),
        entry.milestone ?? entry.label ?? null,
        invoiceAmounts.baseAmount,
        discountPct,
        invoiceAmounts.referralBonusAmount,
        invoiceAmounts.zelleAmount,
        invoiceAmounts.cardAmount,
        entry.dueDate,
      ],
    );

    createdInvoices.push({
      id: invoiceId,
      invoiceCode,
      customerName,
      service: normalizeServiceName(entry.serviceName),
      dueDate: entry.dueDate,
      amount: invoiceAmounts.baseAmount,
    });
  }

  return createdInvoices;
}

async function upsertZelleAlias(client, customerId, zelleAlias, customerName) {
  const aliasName = zelleAlias?.name?.trim();
  const aliasEmail = zelleAlias?.email?.trim();
  const aliasPhoneLast4 = normalizeDigits(zelleAlias?.phoneLast4 || "").slice(-4);

  if (!aliasName && !aliasEmail && !aliasPhoneLast4) {
    return;
  }

  const normalizedAliasName = normalizeName(aliasName || customerName);
  const normalizedAliasEmail = aliasEmail ? normalizeEmail(aliasEmail) : null;

  const existingAliasResult = await client.query(
    `
      SELECT id
      FROM customer_aliases
      WHERE customer_id = $1
        AND relation = 'zelle identity'
        AND normalized_name = $2
        AND COALESCE(normalized_email, '') = COALESCE($3, '')
        AND COALESCE(phone_last4, '') = COALESCE($4, '')
      LIMIT 1
    `,
    [customerId, normalizedAliasName, normalizedAliasEmail, aliasPhoneLast4 || null],
  );

  if (existingAliasResult.rowCount) {
    return;
  }

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
      VALUES ($1, $2, $3, $4, 'zelle identity', $5, $6, $7)
    `,
    [
      `alias-${customerId}-${crypto.randomUUID()}`,
      customerId,
      aliasName || customerName,
      normalizedAliasName,
      aliasEmail || null,
      normalizedAliasEmail,
      aliasPhoneLast4 || null,
    ],
  );
}

async function insertCustomerAggregate(
  client,
  {
    customerId,
    customerCode,
    customerName,
    customerEmail,
    customerPhone,
    serviceEntries,
    profile,
    zelleAlias,
  },
) {
  await ensureUniqueCustomerIdentity(client, { customerEmail, customerPhone });

  await client.query(
    `
      INSERT INTO customers (id, customer_code, initials, full_name, normalized_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    `,
    [customerId, customerCode, buildInitials(customerName), customerName, normalizeName(customerName)],
  );

  await upsertPrimaryEmail(client, customerId, customerEmail);
  await upsertPrimaryPhone(client, customerId, customerPhone);
  await insertServiceEnrollments(client, customerId, serviceEntries);

  await upsertCustomerProfile(client, customerId, profile);
  await upsertZelleAlias(client, customerId, zelleAlias, customerName);
}

async function updateCustomerAggregate(
  client,
  {
    customerId,
    customerCode,
    customerName,
    customerEmail,
    customerPhone,
    serviceEntries,
    profile,
    zelleAlias,
  },
) {
  await ensureUniqueCustomerIdentity(client, {
    customerEmail,
    customerPhone,
    ignoreCustomerId: customerId,
  });

  await client.query(
    `
      UPDATE customers
      SET customer_code = COALESCE($2, customer_code),
          initials = $3,
          full_name = $4,
          normalized_name = $5,
          updated_at = NOW()
      WHERE id = $1
    `,
    [customerId, customerCode ?? null, buildInitials(customerName), customerName, normalizeName(customerName)],
  );

  await upsertPrimaryEmail(client, customerId, customerEmail);
  await upsertPrimaryPhone(client, customerId, customerPhone);
  await insertServiceEnrollments(client, customerId, serviceEntries);
  await upsertCustomerProfile(client, customerId, profile);
  await upsertZelleAlias(client, customerId, zelleAlias, customerName);
}

async function loadReferralProgramConfig(client) {
  const result = await client.query(
    `
      SELECT setting_json
      FROM system_settings
      WHERE setting_key = 'referral_program'
      LIMIT 1
    `,
  );

  return normalizeReferralProgramConfig(result.rows[0]?.setting_json ?? DEFAULT_REFERRAL_PROGRAM);
}

async function upsertReferralProgramConfig(client, config) {
  const normalized = normalizeReferralProgramConfig(config);
  await client.query(
    `
      INSERT INTO system_settings (setting_key, setting_json, updated_at)
      VALUES ('referral_program', $1::jsonb, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE
      SET setting_json = EXCLUDED.setting_json,
          updated_at = NOW()
    `,
    [JSON.stringify(normalized)],
  );
  return normalized;
}

async function fetchCustomerByCodeAndEmail(client, customerCode, email) {
  const normalizedCode = normalizeCustomerCode(customerCode);
  const normalizedEmail = normalizeEmail(email || "");
  if (!normalizedCode || !normalizedEmail) {
    return null;
  }

  const result = await client.query(
    `
      SELECT c.id, c.customer_code, c.full_name
      FROM customers c
      JOIN customer_emails ce ON ce.customer_id = c.id
      WHERE c.customer_code = $1
        AND ce.normalized_email = $2
      LIMIT 1
    `,
    [normalizedCode, normalizedEmail],
  );

  return result.rows[0] ?? null;
}

async function findCustomerByReferralContact(client, { email, phoneDigits }) {
  const normalizedEmail = normalizeEmail(email || "");
  if (normalizedEmail) {
    const emailResult = await client.query(
      `
        SELECT c.id, c.customer_code, c.full_name
        FROM customer_emails ce
        JOIN customers c ON c.id = ce.customer_id
        WHERE ce.normalized_email = $1
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (emailResult.rowCount) {
      return emailResult.rows[0];
    }
  }

  if (phoneDigits) {
    const phoneResult = await client.query(
      `
        SELECT c.id, c.customer_code, c.full_name
        FROM customer_phones cp
        JOIN customers c ON c.id = cp.customer_id
        WHERE cp.normalized_digits = $1
        LIMIT 1
      `,
      [phoneDigits],
    );

    if (phoneResult.rowCount) {
      return phoneResult.rows[0];
    }
  }

  return null;
}

async function findExistingReferralForCustomer(client, customerId) {
  if (!customerId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT cr.id, cr.referrer_customer_id, c.full_name, c.customer_code
      FROM customer_referrals cr
      JOIN customers c ON c.id = cr.referrer_customer_id
      WHERE cr.referred_customer_id = $1
      LIMIT 1
    `,
    [customerId],
  );

  return result.rows[0] ?? null;
}

async function findPendingReferralSubmissionByContact(
  client,
  { referredEmail, referredPhone, referrerCustomerId = null },
) {
  const normalizedEmail = normalizeEmail(referredEmail || "");
  const phoneDigits = normalizeDigits(referredPhone || "");
  if (!normalizedEmail && !phoneDigits) {
    return null;
  }

  const result = await client.query(
    `
      SELECT *
      FROM referral_submissions
      WHERE status = 'submitted'
        AND (
          ($1::text IS NOT NULL AND referred_normalized_email = $1)
          OR ($2::text IS NOT NULL AND referred_phone_digits = $2)
        )
        AND ($3::text IS NULL OR referrer_customer_id = $3::text)
      ORDER BY submitted_at ASC, created_at ASC, id ASC
      LIMIT 1
    `,
    [normalizedEmail || null, phoneDigits || null, referrerCustomerId || null],
  );

  return result.rows[0] ?? null;
}

async function createReferralSubmissionRecord(
  client,
  {
    referrerCustomerId,
    referrerEmail,
    referredFullName,
    referredEmail,
    referredPhone = null,
    relationshipLabel = null,
    notes = null,
    source = "public_form",
    matchedCustomerId = null,
  },
) {
  const submissionId = `refsub-${crypto.randomUUID()}`;
  const normalizedEmail = normalizeEmail(referredEmail || "");
  const normalizedPhoneDigits = normalizeDigits(referredPhone || "");

  await client.query(
    `
      INSERT INTO referral_submissions (
        id,
        referrer_customer_id,
        matched_customer_id,
        source,
        status,
        referrer_email,
        referred_full_name,
        referred_email,
        referred_normalized_email,
        referred_phone,
        referred_phone_digits,
        relationship_label,
        notes,
        submitted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'submitted', $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW()
      )
    `,
    [
      submissionId,
      referrerCustomerId,
      matchedCustomerId,
      source,
      referrerEmail,
      referredFullName,
      referredEmail,
      normalizedEmail,
      referredPhone || null,
      normalizedPhoneDigits || null,
      relationshipLabel?.trim() || null,
      notes?.trim() || null,
    ],
  );

  return submissionId;
}

async function markReferralSubmissionConverted(
  client,
  { submissionId, matchedCustomerId, convertedCustomerId, convertedReferralId, actingUsername = "unknown" },
) {
  await client.query(
    `
      UPDATE referral_submissions
      SET status = 'converted',
          matched_customer_id = COALESCE($2::text, matched_customer_id),
          converted_customer_id = $3,
          converted_referral_id = $4,
          converted_at = NOW(),
          reviewed_by_username = $5,
          updated_at = NOW()
      WHERE id = $1
    `,
    [submissionId, matchedCustomerId ?? null, convertedCustomerId ?? null, convertedReferralId ?? null, actingUsername],
  );
}

async function dismissReferralSubmissionRecord(
  client,
  { submissionId, actingUsername = "unknown", reviewNotes = null },
) {
  const result = await client.query(
    `
      UPDATE referral_submissions
      SET status = 'dismissed',
          dismissed_at = NOW(),
          reviewed_by_username = $2,
          review_notes = COALESCE($3, review_notes),
          updated_at = NOW()
      WHERE id = $1
        AND status = 'submitted'
      RETURNING *
    `,
    [submissionId, actingUsername, reviewNotes?.trim() || null],
  );

  return result.rows[0] ?? null;
}

async function fetchReferralSubmissionForUpdate(client, submissionId) {
  const result = await client.query(
    `
      SELECT *
      FROM referral_submissions
      WHERE id = $1
      FOR UPDATE
    `,
    [submissionId],
  );

  return result.rows[0] ?? null;
}

async function upsertCustomerReferral(
  client,
  {
    referrerCustomerId,
    referredCustomerId,
    relationshipLabel = null,
    referredOn = null,
    notes = null,
  },
) {
  if (!referrerCustomerId || !referredCustomerId || referrerCustomerId === referredCustomerId) {
    return null;
  }

  const config = await loadReferralProgramConfig(client);
  if (!config.enabled) {
    return null;
  }

  const existingResult = await client.query(
    `
      SELECT id
      FROM customer_referrals
      WHERE referred_customer_id = $1
      LIMIT 1
    `,
    [referredCustomerId],
  );

  if (existingResult.rowCount) {
    await client.query(
      `
        UPDATE customer_referrals
        SET referrer_customer_id = $2,
            relationship_label = COALESCE($3, relationship_label),
            referred_on = COALESCE($4::date, referred_on),
            notes = COALESCE($5, notes),
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        existingResult.rows[0].id,
        referrerCustomerId,
        relationshipLabel?.trim() || null,
        formatDateOnlyOutput(referredOn),
        notes,
      ],
    );
    return existingResult.rows[0].id;
  }

  const referralId = `ref-${crypto.randomUUID()}`;
  await client.query(
    `
      INSERT INTO customer_referrals (
        id,
        referrer_customer_id,
        referred_customer_id,
        relationship_label,
        referred_on,
        status,
        bonus_amount,
        qualifying_paid_amount,
        qualifying_months,
        program_snapshot,
        notes,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::date, 'active', $6, $7, $8, $9::jsonb, $10, NOW(), NOW())
    `,
    [
      referralId,
      referrerCustomerId,
      referredCustomerId,
      relationshipLabel?.trim() || null,
      formatDateOnlyOutput(referredOn),
      Number(config.bonusAmount || 0),
      Number(config.qualifyingPaidAmount || 0),
      Number(config.qualificationMonths || 0),
      JSON.stringify(config),
      notes,
    ],
  );

  return referralId;
}

async function awardReferralRewardsForCustomer(client, customerId) {
  const referralsResult = await client.query(
    `
      SELECT *
      FROM customer_referrals
      WHERE referred_customer_id = $1
        AND status IN ('active', 'qualified')
      ORDER BY created_at ASC, id ASC
    `,
    [customerId],
  );

  if (!referralsResult.rowCount) {
    return [];
  }

  const paymentsResult = await client.query(
    `
      SELECT COALESCE(SUM(amount_received), 0)::numeric AS total_paid
      FROM payments
      WHERE customer_id = $1
        AND review_status = 'confirmed'
    `,
    [customerId],
  );

  const totalPaid = Number(paymentsResult.rows[0]?.total_paid || 0);
  const awarded = [];
  const now = new Date();

  for (const referral of referralsResult.rows) {
    const qualifiedAt = new Date(referral.created_at);
    qualifiedAt.setMonth(qualifiedAt.getMonth() + Number(referral.qualifying_months || 0));

    const qualifiesByAmount = totalPaid >= Number(referral.qualifying_paid_amount || 0);
    const qualifiesByTime = now >= qualifiedAt;
    if (!qualifiesByAmount && !qualifiesByTime) {
      continue;
    }

    const rewardId = `reward-${referral.id}`;
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
          created_at
        )
        VALUES ($1, $2, $3, 'referral_bonus', 'available', $4, $5, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `,
      [
        rewardId,
        referral.referrer_customer_id,
        referral.id,
        Number(referral.bonus_amount || 0),
        `Referral bonus unlocked for customer ${customerId}`,
      ],
    );

    await client.query(
      `
        UPDATE customer_referrals
        SET status = 'qualified',
            qualified_at = COALESCE(qualified_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
      [referral.id],
    );

    awarded.push({
      referralId: referral.id,
      referrerCustomerId: referral.referrer_customer_id,
      amount: Number(referral.bonus_amount || 0),
    });
  }

  return awarded;
}

async function hydratePortalState(client) {
  const customersResult = await client.query(`
    SELECT id, customer_code, initials, full_name, normalized_name
    FROM customers
    ORDER BY full_name ASC
  `);
  const servicesResult = await client.query(`
    SELECT id, customer_id, service_name, service_code, is_custom, enrolled_at
    FROM customer_service_enrollments
    ORDER BY customer_id, enrolled_at DESC, created_at DESC, id DESC
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
  const profilesResult = await client.query(`
    SELECT
      customer_id,
      onboarding_status,
      intake_source,
      preferred_payment_method,
      fee_type,
      billing_cadence,
      referral_source,
      billing_notes,
      service_start_date,
      home_address_line1,
      home_address_line2,
      home_city,
      home_state,
      home_postal_code,
      home_country,
      onboarded_at
    FROM customer_profiles
    ORDER BY onboarded_at DESC, customer_id ASC
  `);
  const contractsResult = await client.query(`
    SELECT *
    FROM customer_contracts
    ORDER BY customer_id, created_at DESC, id DESC
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
      customers.full_name AS resolved_customer_name,
      customers.customer_code AS resolved_customer_code,
      invoices.invoice_code AS matched_invoice_code
    FROM payments
    LEFT JOIN customers ON customers.id = payments.customer_id
    LEFT JOIN invoices ON invoices.id = payments.invoice_id
    ORDER BY COALESCE(payments.received_at, payments.created_at) DESC, payments.created_at DESC, payments.id DESC
  `);
  const exceptionsResult = await client.query(`
    SELECT
      exceptions.*,
      payments.customer_id AS payment_customer_id,
      payments.customer_name AS payment_customer_name,
      payments.matched_signals AS payment_matched_signals,
      payments.score AS payment_score,
      payments.subject AS payment_subject,
      payments.raw_text AS payment_raw_text,
      payments.received_at AS payment_received_at,
      payments.transaction_reference AS payment_transaction_reference,
      payments.memo AS payment_memo,
      payments.source_provider AS payment_source_provider,
      payments.source_thread_id AS payment_source_thread_id,
      payments.message_from_email AS payment_message_from_email,
      payments.message_to_email AS payment_message_to_email,
      payments.message_date_header AS payment_message_date_header,
      payments.transaction_date AS payment_transaction_date,
      payments.parsed_payload AS payment_parsed_payload,
      payments.duplicate_of_payment_id AS payment_duplicate_of_payment_id,
      payment_customers.customer_code AS payment_customer_code
    FROM exceptions
    LEFT JOIN payments
      ON payments.source_message_id = exceptions.source_message_id
    LEFT JOIN customers AS payment_customers
      ON payment_customers.id = payments.customer_id
    WHERE status = 'open'
    ORDER BY created_at DESC, id DESC
  `);
  const exceptionCandidatesResult = await client.query(`
    SELECT *
    FROM exception_candidates
    ORDER BY exception_id, sort_order ASC
  `);
  const exceptionHistoryResult = await client.query(`
    SELECT
      exception_resolution_history.*,
      customers.full_name AS resolved_customer_name,
      customers.customer_code AS resolved_customer_code,
      invoices.invoice_code
    FROM exception_resolution_history
    LEFT JOIN customers
      ON customers.id = exception_resolution_history.resolved_customer_id
    LEFT JOIN invoices
      ON invoices.id = exception_resolution_history.invoice_id
    ORDER BY resolved_at DESC, id DESC
  `);
  const activityResult = await client.query(`
    SELECT id, label, actor_username
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
  const referralProgramResult = await client.query(`
    SELECT setting_json
    FROM system_settings
    WHERE setting_key = 'referral_program'
  `);
  const referralSubmissionsResult = await client.query(`
    SELECT *
    FROM referral_submissions
    ORDER BY submitted_at DESC, created_at DESC, id DESC
  `);
  const referralsResult = await client.query(`
    SELECT *
    FROM customer_referrals
    ORDER BY created_at DESC, id DESC
  `);
  const rewardsResult = await client.query(`
    SELECT *
    FROM customer_reward_ledger
    ORDER BY earned_at DESC, created_at DESC, id DESC
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
    customerCode: normalizeCustomerCode(row.customer_code) ?? row.customer_code,
    initials: row.initials,
    name: row.full_name,
    services: [],
    serviceHistory: [],
    emails: [],
    phones: [],
    aliases: [],
    invoices: [],
    contracts: [],
    activeContract: null,
    profile: createEmptyCustomerProfile(),
  }));
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

  for (const row of servicesResult.rows) {
    const customer = customerMap.get(row.customer_id);
    if (!customer) {
      continue;
    }

    customer.serviceHistory.push(mapServiceEnrollmentRow(row));
    appendServiceSummary(customer, row.service_name);
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

  for (const row of profilesResult.rows) {
    const customer = customerMap.get(row.customer_id);
    if (customer) {
      customer.profile = mapCustomerProfileRow(row);
    }
  }

  for (const row of contractsResult.rows) {
    const customer = customerMap.get(row.customer_id);
    if (!customer) {
      continue;
    }

    const contract = mapContractRow(row);
    customer.contracts.push(contract);
    customer.activeContract =
      selectPreferredContract(customer.contracts, { requireBilling: true }) ??
      selectPreferredContract(customer.contracts, { requireProfile: true }) ??
      customer.contracts[0] ??
      null;
  }

  const invoices = invoicesResult.rows.map((row) => {
    const invoice = mapInvoiceRow(row);
    const customer = customerMap.get(invoice.customerId);
    if (customer && !customer.invoices.includes(invoice.invoiceCode)) {
      customer.invoices.push(invoice.invoiceCode);
    }
    return invoice;
  });
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const payments = paymentsResult.rows.map(mapPaymentRow);
  const pendingPayments = payments
    .filter((payment) => payment.reviewStatus === "pending")
    .map((payment) => ({ ...payment }));

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
    customerId: row.payment_customer_id ?? null,
    customerName: row.payment_customer_name ?? null,
    customerCode: row.payment_customer_code ?? null,
    matchedSignals: row.payment_matched_signals ?? [],
    score: Number(row.payment_score || 0),
    subject: row.payment_subject ?? null,
    rawText: row.payment_raw_text ?? null,
    receivedAt: formatTimestamp(row.payment_received_at),
    transactionReference: row.payment_transaction_reference ?? null,
    memo: row.payment_memo ?? null,
    sourceProvider: row.payment_source_provider ?? "gmail",
    sourceThreadId: row.payment_source_thread_id ?? null,
    messageFromEmail: row.payment_message_from_email ?? null,
    messageToEmail: row.payment_message_to_email ?? null,
    messageDateHeader: row.payment_message_date_header ?? null,
    transactionDate: row.payment_transaction_date ?? null,
    parsedPayload: row.payment_parsed_payload ?? {},
    duplicateOfPaymentId: row.payment_duplicate_of_payment_id ?? null,
    candidates: exceptionCandidates.get(row.id) ?? [],
  }));
  const exceptionHistory = exceptionHistoryResult.rows.map(mapExceptionHistoryRow);

  const currentDashboard = dashboardResult.rows[0];
  const gmailState = normalizeGmailIntegrationState(gmailIntegrationResult.rows[0]?.state_json ?? {});
  const referralProgram = normalizeReferralProgramConfig(
    referralProgramResult.rows[0]?.setting_json ?? DEFAULT_REFERRAL_PROGRAM,
  );
  const rewards = rewardsResult.rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: customerMap.get(row.customer_id)?.name ?? "Unknown customer",
    customerCode: customerMap.get(row.customer_id)?.customerCode ?? null,
    referralId: row.referral_id ?? null,
    rewardType: row.reward_type,
    status: row.status,
    amount: Number(row.amount || 0),
    description: row.description ?? null,
    earnedAt: formatTimestamp(row.earned_at),
    appliedAt: formatTimestamp(row.applied_at),
    appliedInvoiceId: row.applied_invoice_id ?? null,
    appliedInvoiceCode:
      normalizeInvoiceCode(invoiceMap.get(row.applied_invoice_id)?.invoiceCode) ??
      invoiceMap.get(row.applied_invoice_id)?.invoiceCode ??
      null,
    appliedByUsername: row.applied_by_username ?? null,
  }));
  const referrals = referralsResult.rows.map((row) => {
    const referrer = customerMap.get(row.referrer_customer_id);
    const referred = customerMap.get(row.referred_customer_id);
    if (referred) {
      referred.profile.referredByCustomerId = row.referrer_customer_id;
      referred.profile.referralRelationshipLabel = row.relationship_label ?? null;
    }
    return {
      id: row.id,
      referrerCustomerId: row.referrer_customer_id,
      referrerCustomerName: referrer?.name ?? "Unknown customer",
      referrerCustomerCode: referrer?.customerCode ?? null,
      referredCustomerId: row.referred_customer_id,
      referredCustomerName: referred?.name ?? "Unknown customer",
      referredCustomerCode: referred?.customerCode ?? null,
      status: row.status,
      relationshipLabel: row.relationship_label ?? null,
      bonusAmount: Number(row.bonus_amount || 0),
      qualifyingPaidAmount: Number(row.qualifying_paid_amount || 0),
      qualifyingMonths: Number(row.qualifying_months || 0),
      notes: row.notes ?? null,
      referredOn: formatDateOnlyOutput(row.referred_on ?? row.created_at),
      qualifiedAt: formatTimestamp(row.qualified_at),
      awardedAt: formatTimestamp(row.awarded_at),
      createdAt: formatTimestamp(row.created_at),
    };
  });
  const referralSubmissions = referralSubmissionsResult.rows.map((row) =>
    mapReferralSubmissionRow(row, customerMap),
  );

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
        customerCode: customerMap.get(invoice.customerId)?.customerCode ?? null,
        customerName: invoice.customerName,
        email: invoice.email,
        service: invoice.service,
        milestone: invoice.milestone,
        dueDate: invoice.dueDate,
        discountPct: invoice.discountPct,
        referralBonusAmount: invoice.referralBonusAmount,
        zelleAmount: invoice.zelleAmount,
        cardAmount: invoice.cardAmount,
        invoiceCode: invoice.invoiceCode,
      })),
    pendingPayments,
    exceptions,
    exceptionHistory,
    invoices,
    payments,
    processedMessageIds: processedMessagesResult.rows.map((row) => row.message_id),
    activity: activityResult.rows.map((row) => ({
      id: row.id,
      label: row.label,
      actorUsername: row.actor_username ?? null,
    })),
    nextInvoiceSequence: sequenceResult.rows[0]?.next_value ?? 1,
    integrations: {
      gmail: {
        lastSyncAt: gmailState.lastSyncAt ?? null,
        lastSyncSummary: gmailState.lastSyncSummary ?? null,
        autoSyncSettings: gmailState.autoSyncSettings,
      },
    },
    admin: {
      referralProgram,
      referralSubmissions,
      referrals,
      rewards,
    },
  };
}

async function insertActivity(client, label, actorUsername = null) {
  await client.query(
    `
      INSERT INTO activity_events (id, label, actor_username, created_at)
      VALUES ($1, $2, $3, NOW())
    `,
    [crypto.randomUUID(), label, actorUsername],
  );
}

async function fetchCustomerAggregate(client, customerId) {
  const customerResult = await client.query(
    `
      SELECT id, customer_code, initials, full_name
      FROM customers
      WHERE id = $1
    `,
    [customerId],
  );

  const row = customerResult.rows[0];
  if (!row) {
    return null;
  }

  const [servicesResult, emailsResult, phonesResult, aliasesResult, invoicesResult, profileResult, referralResult, contractsResult] = await Promise.all([
    client.query(
      `
        SELECT id, service_name, service_code, is_custom, enrolled_at
        FROM customer_service_enrollments
        WHERE customer_id = $1
        ORDER BY enrolled_at DESC, created_at DESC, id DESC
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
    client.query(
      `
        SELECT
          onboarding_status,
          intake_source,
          preferred_payment_method,
          fee_type,
          billing_cadence,
          referral_source,
          billing_notes,
          service_start_date,
          home_address_line1,
          home_address_line2,
          home_city,
          home_state,
          home_postal_code,
          home_country,
          onboarded_at
        FROM customer_profiles
        WHERE customer_id = $1
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT referrer_customer_id, relationship_label, referred_on
        FROM customer_referrals
        WHERE referred_customer_id = $1
        LIMIT 1
      `,
      [customerId],
    ),
    client.query(
      `
        SELECT *
        FROM customer_contracts
        WHERE customer_id = $1
        ORDER BY created_at DESC, id DESC
      `,
      [customerId],
    ),
  ]);
  const mappedContracts = contractsResult.rows.map(mapContractRow);

  return {
    id: row.id,
    customerCode: normalizeCustomerCode(row.customer_code) ?? row.customer_code,
    initials: row.initials,
    name: row.full_name,
    services: Array.from(
      new Set(servicesResult.rows.map((item) => item.service_name)),
    ),
    serviceHistory: servicesResult.rows.map(mapServiceEnrollmentRow),
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
    invoices: invoicesResult.rows.map((item) => normalizeInvoiceCode(item.invoice_code) ?? item.invoice_code),
    contracts: mappedContracts,
    activeContract:
      selectPreferredContract(mappedContracts, { requireBilling: true }) ??
      selectPreferredContract(mappedContracts, { requireProfile: true }) ??
      mappedContracts[0] ??
      null,
    profile: profileResult.rows[0]
      ? {
          ...mapCustomerProfileRow(profileResult.rows[0]),
          referredByCustomerId: referralResult.rows[0]?.referrer_customer_id ?? null,
          referralRelationshipLabel: referralResult.rows[0]?.relationship_label ?? null,
        }
      : createEmptyCustomerProfile({
          referredByCustomerId: referralResult.rows[0]?.referrer_customer_id ?? null,
          referralRelationshipLabel: referralResult.rows[0]?.relationship_label ?? null,
        }),
  };
}

async function fetchContractRecord(client, contractId) {
  const result = await client.query(
    `
      SELECT *
      FROM customer_contracts
      WHERE id = $1
      LIMIT 1
    `,
    [contractId],
  );

  return result.rows[0] ?? null;
}

async function reserveSequenceValue(client, sequenceName, startingValue = 1) {
  await client.query(`
    INSERT INTO app_sequences (sequence_name, next_value)
    VALUES ($1, $2)
    ON CONFLICT (sequence_name) DO NOTHING
  `, [sequenceName, startingValue]);

  const sequenceResult = await client.query(
    `
      SELECT next_value
      FROM app_sequences
      WHERE sequence_name = $1
      FOR UPDATE
    `,
    [sequenceName],
  );
  const currentValue = Number(sequenceResult.rows[0]?.next_value ?? 1);

  await client.query(
    `
      UPDATE app_sequences
      SET next_value = $2
      WHERE sequence_name = $1
    `,
    [sequenceName, currentValue + 1],
  );

  return currentValue;
}

async function reserveNextInvoiceCode(client) {
  const sequence = await reserveSequenceValue(client, "invoice", 1);

  return {
    sequence,
    invoiceCode: createInvoiceRefPreview(sequence),
  };
}

async function reserveNextCustomerCode(client) {
  const sequence = await reserveSequenceValue(client, "customer", 1);
  return {
    sequence,
    customerCode: createCustomerCodePreview(sequence),
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
      SELECT payments.*
      FROM payments
      WHERE payments.id = $1
        AND payments.review_status = 'pending'
      FOR UPDATE OF payments
    `,
    [paymentId],
  );

  return result.rows[0] ?? null;
}

async function fetchPaymentBySourceMessage(client, sourceMessageId) {
  if (!sourceMessageId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT *
      FROM payments
      WHERE source_message_id = $1
      LIMIT 1
    `,
    [sourceMessageId],
  );

  return result.rows[0] ?? null;
}

async function fetchConfirmedPaymentForUpdate(client, paymentId) {
  const result = await client.query(
    `
      SELECT payments.*
      FROM payments
      WHERE payments.id = $1
        AND payments.review_status = 'confirmed'
      FOR UPDATE OF payments
    `,
    [paymentId],
  );

  return result.rows[0] ?? null;
}

async function fetchReferralRewardForUpdate(client, rewardId) {
  const result = await client.query(
    `
      SELECT *
      FROM customer_reward_ledger
      WHERE id = $1
        AND reward_type = 'referral_bonus'
      FOR UPDATE
    `,
    [rewardId],
  );

  return result.rows[0] ?? null;
}

async function findNextDraftInvoiceForCustomer(client, customerId) {
  const result = await client.query(
    `
      SELECT
        invoices.*,
        customers.full_name AS customer_name
      FROM invoices
      JOIN customers ON customers.id = invoices.customer_id
      WHERE invoices.customer_id = $1
        AND invoices.status = 'draft'
      ORDER BY invoices.due_date ASC, invoices.created_at ASC, invoices.id ASC
      LIMIT 1
      FOR UPDATE OF invoices
    `,
    [customerId],
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

async function findConfirmedDuplicatePayment(client, paymentRow) {
  const exactConflict = await client.query(
    `
      SELECT
        payments.*,
        customers.full_name AS resolved_customer_name,
        customers.customer_code AS resolved_customer_code,
        invoices.invoice_code AS matched_invoice_code
      FROM payments
      LEFT JOIN customers ON customers.id = payments.customer_id
      LEFT JOIN invoices ON invoices.id = payments.invoice_id
      WHERE payments.id <> $1
        AND payments.review_status = 'confirmed'
        AND (
          ($2::text IS NOT NULL
            AND payments.source_provider = $3
            AND LOWER(payments.transaction_reference) = LOWER($2))
          OR ($4::text IS NOT NULL AND payments.invoice_id = $4)
        )
      ORDER BY payments.applied_at DESC NULLS LAST, payments.created_at DESC, payments.id DESC
      LIMIT 1
    `,
    [
      paymentRow.id,
      paymentRow.transaction_reference ?? null,
      paymentRow.source_provider ?? "gmail",
      paymentRow.invoice_id ?? null,
    ],
  );

  if (exactConflict.rowCount) {
    return mapPaymentRow(exactConflict.rows[0]);
  }

  if (!paymentRow.customer_id) {
    return null;
  }

  const customerCandidates = await client.query(
    `
      SELECT
        payments.*,
        customers.full_name AS resolved_customer_name,
        customers.customer_code AS resolved_customer_code,
        invoices.invoice_code AS matched_invoice_code
      FROM payments
      LEFT JOIN customers ON customers.id = payments.customer_id
      LEFT JOIN invoices ON invoices.id = payments.invoice_id
      WHERE payments.id <> $1
        AND payments.review_status = 'confirmed'
        AND payments.customer_id = $2
        AND payments.amount_received = $3::numeric
      ORDER BY payments.applied_at DESC NULLS LAST, payments.created_at DESC, payments.id DESC
    `,
    [paymentRow.id, paymentRow.customer_id, Number(paymentRow.amount_received || 0)],
  );

  const incomingDate = normalizeDateOnly(paymentRow.transaction_date || paymentRow.received_at);
  for (const row of customerCandidates.rows) {
    const existingDate = normalizeDateOnly(row.transaction_date || row.received_at);
    if (incomingDate && existingDate && incomingDate !== existingDate) {
      continue;
    }

    if (!sameSenderIdentity(row, paymentRow)) {
      continue;
    }

    return mapPaymentRow(row);
  }

  return null;
}

async function movePaymentToDuplicateException(client, paymentRow, duplicatePayment) {
  const duplicateSummary = buildDuplicateSummary(duplicatePayment);

  await client.query(
    `
      UPDATE payments
      SET review_status = 'exception',
          match_status = 'unmatched',
          duplicate_of_payment_id = $2,
          review_notes = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [paymentRow.id, duplicatePayment.id, duplicateSummary],
  );

  await upsertExceptionFromMatch(client, {
    id: `exc-${paymentRow.source_message_id ?? paymentRow.id}`,
    kind: "duplicate",
    customerId: paymentRow.customer_id ?? duplicatePayment.customerId ?? null,
    customerName:
      paymentRow.customer_name ?? paymentRow.resolved_customer_name ?? duplicatePayment.customerName ?? null,
    customerCode: duplicatePayment.customerCode ?? null,
    matchedSignals: [],
    score: 100,
    senderName: paymentRow.sender_name_raw ?? duplicatePayment.senderNameRaw ?? "Unknown sender",
    amount: Number(paymentRow.amount_received || 0),
    dateLabel: paymentRow.date_label ?? "",
    senderEmail: paymentRow.sender_email ?? null,
    senderPhoneLast4: paymentRow.sender_phone_last4 ?? null,
    invoiceId: paymentRow.invoice_id ?? duplicatePayment.invoiceId ?? null,
    summary: duplicateSummary,
    sourceMessageId: paymentRow.source_message_id ?? null,
    duplicateOfPaymentId: duplicatePayment.id,
  });

  await insertActivity(
    client,
    `Potential duplicate blocked for ${duplicatePayment.customerName ?? paymentRow.customer_name ?? "customer"}`,
  );

  return {
    applied: false,
    state: await hydratePortalState(client),
    message: "Potential duplicate detected. Transaction was not applied and was moved to exceptions.",
  };
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
        AND ROUND(invoices.zelle_amount, 2) = ROUND($2::numeric, 2)
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
      SET state_json = integration_states.state_json || EXCLUDED.state_json,
          updated_at = NOW()
    `,
    [JSON.stringify(gmailState)],
  );
}

async function resolveOpenExceptionsForMessage(client, sourceMessageId, action = "reconciled") {
  if (!sourceMessageId) {
    return;
  }

  await client.query(
    `
      UPDATE exceptions
      SET status = 'resolved',
          resolution_action = $2,
          resolved_at = NOW()
      WHERE source_message_id = $1
        AND status = 'open'
    `,
    [sourceMessageId, action],
  );
}

async function insertExceptionResolutionHistory(
  client,
  {
    exception,
    paymentRow,
    resolutionAction,
    resolutionMessage,
    resolvedByUsername,
    resolvedCustomerId = null,
  },
) {
  await client.query(
    `
      INSERT INTO exception_resolution_history (
        id,
        exception_id,
        exception_kind,
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
        source_provider,
        transaction_reference,
        memo,
        matched_signals,
        score,
        resolution_action,
        resolution_message,
        resolved_by_username,
        resolved_customer_id,
        resolved_payment_id,
        original_exception_created_at,
        resolved_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::text[], $20, $21, $22, $23, $24, $25, $26, NOW()
      )
    `,
    [
      crypto.randomUUID(),
      exception.id,
      exception.kind,
      exception.sender_name,
      Number(exception.amount || 0),
      exception.expected_amount === null || exception.expected_amount === undefined
        ? null
        : Number(exception.expected_amount),
      exception.date_label ?? "",
      exception.sender_email ?? null,
      exception.sender_phone_last4 ?? null,
      exception.service_name ?? null,
      exception.milestone ?? null,
      exception.invoice_id ?? null,
      exception.summary,
      exception.alias_name ?? null,
      exception.source_message_id ?? null,
      paymentRow?.source_provider ?? "gmail",
      paymentRow?.transaction_reference ?? null,
      paymentRow?.memo ?? null,
      paymentRow?.matched_signals ?? [],
      Number(paymentRow?.score || 0),
      resolutionAction,
      resolutionMessage ?? null,
      resolvedByUsername ?? "unknown",
      resolvedCustomerId ?? paymentRow?.customer_id ?? null,
      paymentRow?.id ?? null,
      exception.created_at ?? null,
    ],
  );
}

async function upsertExceptionFromMatch(client, exception) {
  if (!exception?.id) {
    return;
  }

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
      ON CONFLICT (id)
      DO UPDATE
      SET kind = EXCLUDED.kind,
          sender_name = EXCLUDED.sender_name,
          amount = EXCLUDED.amount,
          expected_amount = EXCLUDED.expected_amount,
          date_label = EXCLUDED.date_label,
          sender_email = EXCLUDED.sender_email,
          sender_phone_last4 = EXCLUDED.sender_phone_last4,
          service_name = EXCLUDED.service_name,
          milestone = EXCLUDED.milestone,
          invoice_id = EXCLUDED.invoice_id,
          summary = EXCLUDED.summary,
          alias_name = EXCLUDED.alias_name,
          source_message_id = EXCLUDED.source_message_id,
          status = 'open',
          resolution_action = NULL,
          resolved_at = NULL
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

  await client.query(
    `
      DELETE FROM exception_candidates
      WHERE exception_id = $1
    `,
    [exception.id],
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

async function reconcileOpenTransactions(client) {
  const state = await hydratePortalState(client);
  const transactionsResult = await client.query(
    `
      SELECT *
      FROM payments
      WHERE review_status IN ('pending', 'exception')
      ORDER BY COALESCE(received_at, created_at) DESC, created_at DESC, id DESC
      FOR UPDATE
    `,
  );

  for (const row of transactionsResult.rows) {
    if (!row.source_message_id) {
      continue;
    }

    if ((row.matched_signals ?? []).includes("manual_selection") || (row.matched_signals ?? []).includes("manual_override")) {
      continue;
    }

    const payment = mapPaymentRow(row);
    const matchResult = matchPaymentToState(payment, state);

    if (matchResult.kind === "pending") {
      await client.query(
        `
          UPDATE payments
          SET customer_id = $2,
              invoice_id = $3,
              customer_name = $4,
              matched_signals = $5::text[],
              score = $6,
              duplicate_of_payment_id = NULL,
              review_status = 'pending',
              match_status = 'matched',
              match_summary = $7,
              review_notes = NULL,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.id,
          matchResult.payment.customerId ?? null,
          matchResult.payment.invoiceId ?? null,
          matchResult.payment.customerName ?? null,
          matchResult.payment.matchedSignals ?? [],
          Number(matchResult.payment.score || 0),
          matchResult.payment.matchSummary ?? "Matched to customer and invoice.",
        ],
      );
      await resolveOpenExceptionsForMessage(client, row.source_message_id, "reconciled");
      continue;
    }

    await client.query(
      `
        UPDATE payments
        SET customer_id = $2,
            invoice_id = $3,
            customer_name = $4,
            matched_signals = $5::text[],
            score = $6,
            duplicate_of_payment_id = $9,
            review_status = 'exception',
            match_status = $7,
            match_summary = $8,
            review_notes = $10,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        row.id,
        matchResult.exception.customerId ?? null,
        matchResult.exception.invoiceId ?? null,
        matchResult.exception.customerName ?? null,
        matchResult.exception.matchedSignals ?? [],
        Number(matchResult.exception.score || 0),
        matchResult.exception.kind === "duplicate" ? "unmatched" : matchResult.exception.kind,
        matchResult.exception.summary ?? "Needs human review.",
        matchResult.exception.duplicateOfPaymentId ?? null,
        matchResult.exception.kind === "duplicate" ? matchResult.exception.summary : null,
      ],
    );

    await upsertExceptionFromMatch(client, {
      id: `exc-${row.source_message_id}`,
      ...matchResult.exception,
    });
  }
}

export async function prepareStateStore() {
  await prepareDatabase();
}

export async function loadState() {
  return withTransaction((client) => hydratePortalState(client), { readOnly: true });
}

export async function loadPublicReferralProgramState() {
  return withTransaction(
    async (client) => ({
      referralProgram: await loadReferralProgramConfig(client),
    }),
    { readOnly: true },
  );
}

export async function loadContractDownloadRecord(contractId) {
  return withTransaction(
    async (client) => {
      const record = await fetchContractRecord(client, contractId);
      if (!record) {
        throw new Error("Contract record not found.");
      }

      const file = await loadStoredContractBinary({
        storageProvider: record.storage_provider,
        storageKey: record.storage_key,
        mimeType: record.mime_type,
        fileName: record.file_name,
      });

      return {
        contract: mapContractRow(record),
        file,
      };
    },
    { readOnly: true },
  );
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

export async function submitPublicReferralEntry(form) {
  return withTransaction(async (client) => {
    const config = await loadReferralProgramConfig(client);
    if (!config.enabled) {
      const error = new Error("Referral intake is not accepting new submissions right now.");
      error.statusCode = 403;
      throw error;
    }

    const referrerCustomerCode = normalizeCustomerCode(form?.referrerCustomerCode);
    const referrerEmail = String(form?.referrerEmail || "").trim();
    const referredFullName = String(form?.referredFullName || "").replace(/\s+/g, " ").trim();
    const referredEmail = String(form?.referredEmail || "").trim();
    const referredPhone = String(form?.referredPhone || "").trim();
    const relationshipLabel = String(form?.relationshipLabel || "").replace(/\s+/g, " ").trim();
    const notes = String(form?.notes || "").trim();

    if (!referrerCustomerCode) {
      throw new Error("Your customer ID is required.");
    }

    if (!referrerEmail) {
      throw new Error("Your email is required.");
    }

    if (!referredFullName) {
      throw new Error("The referred person's full name is required.");
    }

    if (!referredEmail) {
      throw new Error("The referred person's email is required.");
    }

    const referrer = await fetchCustomerByCodeAndEmail(client, referrerCustomerCode, referrerEmail);
    if (!referrer) {
      throw new Error("We could not verify that customer ID and email together. Check both and try again.");
    }

    const matchedCustomer = await findCustomerByReferralContact(client, {
      email: referredEmail,
      phoneDigits: normalizeDigits(referredPhone || ""),
    });

    if (matchedCustomer?.id === referrer.id) {
      throw new Error("Self-referrals are not allowed.");
    }

    const existingSubmission = await findPendingReferralSubmissionByContact(client, {
      referredEmail,
      referredPhone,
    });
    if (existingSubmission) {
      throw new Error("This referral is already on file and waiting for finance review.");
    }

    const existingReferral = await findExistingReferralForCustomer(client, matchedCustomer?.id ?? null);
    if (existingReferral) {
      throw new Error(
        `This person is already linked to a tracked referral from ${existingReferral.full_name} (${normalizeCustomerCode(existingReferral.customer_code) ?? existingReferral.customer_code}).`,
      );
    }

    try {
      await createReferralSubmissionRecord(client, {
        referrerCustomerId: referrer.id,
        referrerEmail,
        referredFullName,
        referredEmail,
        referredPhone,
        relationshipLabel,
        notes,
        matchedCustomerId: matchedCustomer?.id ?? null,
      });
    } catch (error) {
      if (error?.code === "23505") {
        throw new Error("This referral is already on file and waiting for finance review.");
      }
      throw error;
    }

    await insertActivity(client, `Referral submitted by ${referrer.full_name} for ${referredFullName}`, "public-form");

    return {
      message: matchedCustomer
        ? `${referredFullName} is already in Setu. Finance can now convert this submission into the referral program from the dashboard.`
        : `${referredFullName} has been added to the referral intake queue.`,
    };
  });
}

export async function createCustomerOnboardingRecord({ form, actingUsername = "unknown" }) {
  return withTransaction(async (client) => {
    const selectedCustomerId = form.selectedCustomerId?.trim() || null;
    const existingCustomer = selectedCustomerId
      ? await fetchCustomerAggregate(client, selectedCustomerId)
      : null;
    const manualReferringCustomerId = form.referringCustomerId?.trim() || null;
    const firstName = form.firstName?.trim();
    const lastName = form.lastName?.trim();
    const customerName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const customerEmail = form.customerEmail?.trim();
    const customerPhone = form.customerPhone?.trim();
    const serviceEntries = normalizeServiceEntries(form.serviceEntries);
    const normalizedContracts = normalizeContractUploads(form.contractUploads);
    const preferredBillingContract = selectPreferredContract(normalizedContracts, { requireBilling: true });
    const contractDerivedFeeType = preferredBillingContract?.parsed?.feeType;
    const contractDerivedBillingCadence = preferredBillingContract?.parsed?.billingCadence;
    const contractDerivedServiceStartDate = preferredBillingContract?.parsed?.serviceStartDate;
    const preferredPaymentMethod = form.preferredPaymentMethod?.trim();
    const feeType =
      form.feeType?.trim() ||
      contractDerivedFeeType?.trim() ||
      (contractDerivedBillingCadence === "monthly" ? "recurring" : "one_time");
    const requestedBillingCadence = form.billingCadence?.trim() || contractDerivedBillingCadence?.trim();
    const billingCadence =
      requestedBillingCadence ||
      (feeType === "recurring" ? "monthly" : "per_milestone");
    const normalizedBillingCadence =
      feeType === "recurring" && billingCadence === "per_milestone"
        ? "monthly"
        : feeType === "one_time" && billingCadence === "monthly"
          ? "per_milestone"
          : billingCadence;
    const serviceStartDate = normalizeDateInput(
      form.serviceStartDate,
      contractDerivedServiceStartDate ?? form.onboardedAt ?? new Date(),
    );
    const invoiceSchedule = normalizeInvoiceScheduleEntries(
      form.invoiceSchedule,
      serviceEntries,
      serviceStartDate,
    );
    const addressProfile = {
      homeAddressLine1: form.homeAddressLine1?.trim() || null,
      homeAddressLine2: form.homeAddressLine2?.trim() || null,
      homeCity: form.homeCity?.trim() || null,
      homeState: form.homeState?.trim() || null,
      homePostalCode: form.homePostalCode?.trim() || null,
      homeCountry: form.homeCountry?.trim() || null,
    };

    if (!firstName) {
      throw new Error("First name is required.");
    }

    if (!lastName) {
      throw new Error("Last name is required.");
    }

    if (!customerEmail) {
      throw new Error("Primary email is required for onboarding.");
    }

    if (!customerPhone) {
      throw new Error("Mobile phone is required for onboarding.");
    }

    if (!serviceEntries.length) {
      throw new Error("Select at least one enrolled service.");
    }

    if (selectedCustomerId && !existingCustomer) {
      throw new Error("Existing customer record could not be found.");
    }

    const matchedReferralSubmission =
      customerEmail && !selectedCustomerId
        ? await findPendingReferralSubmissionByContact(client, {
            referredEmail: customerEmail,
            referredPhone: customerPhone,
            referrerCustomerId: manualReferringCustomerId || null,
          })
        : null;
    const effectiveReferringCustomerId =
      manualReferringCustomerId || matchedReferralSubmission?.referrer_customer_id || null;
    const effectiveRelationshipLabel =
      form.referralRelationship?.trim() || matchedReferralSubmission?.relationship_label || null;
    const effectiveReferralSource =
      form.referralSource?.trim() ||
      matchedReferralSubmission?.notes ||
      (matchedReferralSubmission ? "Public referral form" : null);

    const customerId = selectedCustomerId || `customer-${crypto.randomUUID()}`;
    const customerCode = selectedCustomerId
      ? existingCustomer.customerCode
      : (await reserveNextCustomerCode(client)).customerCode;
    const profile = {
      onboardingStatus: "complete",
      intakeSource: "onboarding",
      preferredPaymentMethod: preferredPaymentMethod || "zelle",
      feeType,
      billingCadence: normalizedBillingCadence || "per_milestone",
      referralSource: effectiveReferralSource,
      billingNotes: form.billingNotes?.trim() || null,
      onboardedAt: form.onboardedAt || new Date().toISOString(),
      serviceStartDate,
      ...addressProfile,
    };
    const zelleAlias = {
      name: form.zelleSenderName?.trim() || null,
      email: form.zelleSenderEmail?.trim() || null,
      phoneLast4: form.zelleSenderPhoneLast4?.trim() || null,
    };

    if (selectedCustomerId) {
      await updateCustomerAggregate(client, {
        customerId,
        customerCode,
        customerName,
        customerEmail,
        customerPhone,
        serviceEntries,
        profile,
        zelleAlias,
      });
      await insertActivity(
        client,
        serviceEntries.length
          ? `Client updated: ${customerName} (${serviceEntries.length} service enrollment${serviceEntries.length === 1 ? "" : "s"} added)`
          : `Client updated: ${customerName}`,
      );
    } else {
      await insertCustomerAggregate(client, {
        customerId,
        customerCode,
        customerName,
        customerEmail,
        customerPhone,
        serviceEntries,
        profile,
        zelleAlias,
      });
      await insertActivity(client, `Client onboarded: ${customerName}`);
    }

    const insertedContracts = normalizedContracts.length
      ? await insertContractRecords(client, {
          customerId,
          customerCode,
          contractUploads: form.contractUploads,
          uploadedByUsername: actingUsername,
        })
      : [];

    const createdInvoices = invoiceSchedule.length
      ? await insertContractInvoiceSchedule(client, {
          customerId,
          customerName,
          customerEmail,
          scheduleEntries: invoiceSchedule,
        })
      : [];

    const referralId = await upsertCustomerReferral(client, {
      referrerCustomerId: effectiveReferringCustomerId,
      referredCustomerId: customerId,
      relationshipLabel: effectiveRelationshipLabel,
      referredOn: matchedReferralSubmission?.submitted_at || form.onboardedAt || new Date().toISOString(),
      notes: effectiveReferralSource,
    });

    if (referralId && matchedReferralSubmission?.id) {
      await markReferralSubmissionConverted(client, {
        submissionId: matchedReferralSubmission.id,
        matchedCustomerId: matchedReferralSubmission.matched_customer_id ?? customerId,
        convertedCustomerId: customerId,
        convertedReferralId: referralId,
        actingUsername,
      });
      await insertActivity(client, `Referral submission converted for ${customerName}`, actingUsername);
    }

    await reconcileOpenTransactions(client);

    if (insertedContracts.length) {
      await insertActivity(
        client,
        `${insertedContracts.length} contract${insertedContracts.length === 1 ? "" : "s"} uploaded for ${customerName}`,
        actingUsername,
      );
    }

    if (createdInvoices.length) {
      await insertActivity(
        client,
        `${createdInvoices.length} draft invoice${createdInvoices.length === 1 ? "" : "s"} generated from contract for ${customerName}`,
        actingUsername,
      );
    }

    return {
      state: await hydratePortalState(client),
      message: selectedCustomerId
        ? `${customerName} updated${serviceEntries.length ? ` with ${serviceEntries.length} new service enrollment${serviceEntries.length === 1 ? "" : "s"}` : ""}${insertedContracts.length ? `, ${insertedContracts.length} contract${insertedContracts.length === 1 ? "" : "s"} stored` : ""}${createdInvoices.length ? `, and ${createdInvoices.length} draft invoice${createdInvoices.length === 1 ? "" : "s"} created` : ""}.`
        : `${customerName} onboarded${insertedContracts.length ? ` with ${insertedContracts.length} contract${insertedContracts.length === 1 ? "" : "s"} stored` : ""}${createdInvoices.length ? ` and ${createdInvoices.length} draft invoice${createdInvoices.length === 1 ? "" : "s"} created` : ""}.`,
    };
  });
}

export async function createInvoiceRecord({ form, sendNow, deliverInvoice }) {
  return withTransaction(async (client) => {
    const isNewCustomer = form.selectedCustomerId === "new";
    const existingCustomer = isNewCustomer
      ? null
      : await fetchCustomerAggregate(client, form.selectedCustomerId);
    const normalizedServiceName = normalizeServiceName(form.service);
    const customerName = isNewCustomer ? form.customerName?.trim() : existingCustomer?.name;

    if (!customerName) {
      throw new Error("Customer name is required before creating an invoice.");
    }

    const customerId = isNewCustomer ? `customer-${crypto.randomUUID()}` : existingCustomer.id;
    const customerCode = isNewCustomer
      ? (await reserveNextCustomerCode(client)).customerCode
      : existingCustomer.customerCode;
    const customerEmail = isNewCustomer
      ? form.customerEmail?.trim()
      : form.selectedEmail || findPrimaryEmail(existingCustomer);
    const customerPhone = isNewCustomer
      ? form.customerPhone?.trim()
      : existingCustomer?.phones?.[0]?.value ?? null;

    if (isNewCustomer) {
      await insertCustomerAggregate(client, {
        customerId,
        customerCode,
        customerName,
        customerEmail,
        customerPhone,
        serviceEntries: normalizeServiceEntries(
          [{ name: normalizedServiceName, isCustom: normalizedServiceName === "Custom" }],
          normalizedServiceName,
          new Date(),
        ),
        profile: {
          onboardingStatus: "needs_follow_up",
          intakeSource: "invoice",
          preferredPaymentMethod: "zelle",
          billingCadence: "per_milestone",
          referralSource: "Created from invoice",
          billingNotes: "Minimal customer created during invoice drafting.",
          onboardedAt: new Date().toISOString(),
        },
      });
    } else {
      const hasService = existingCustomer.services.includes(normalizedServiceName);
      if (!hasService) {
        await insertServiceEnrollments(client, customerId, [
          {
            name: normalizedServiceName,
            isCustom: normalizedServiceName === "Custom",
            enrolledAt: new Date(),
          },
        ]);
      }
    }

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
    const amount = roundCurrency(form.amount);
    const discountPct = Number(form.discountPct || 0);
    const invoiceAmounts = calculateInvoiceAmounts(amount, discountPct, 0);
    const invoice = {
      id: `inv-${crypto.randomUUID()}`,
      invoiceCode,
      customerId,
      customerName,
      email: customerEmail ?? null,
      service: normalizedServiceName,
      milestone: form.milestone ?? null,
      baseAmount: invoiceAmounts.baseAmount,
      discountPct,
      referralBonusAmount: invoiceAmounts.referralBonusAmount,
      zelleAmount: invoiceAmounts.zelleAmount,
      cardAmount: invoiceAmounts.cardAmount,
      dueDate: form.dueDate,
      status: sendNow ? "sent" : "draft",
      source: "manual",
    };

    const customer = isNewCustomer
      ? {
          id: customerId,
          customerCode,
          initials: buildInitials(customerName),
          name: customerName,
          services: [normalizedServiceName],
          emails: customerEmail
            ? [{ value: customerEmail, label: "personal", isPrimary: true }]
            : [],
          phones: customerPhone
            ? [{ value: customerPhone, label: "mobile", isPrimary: true }]
            : [],
          aliases: [],
          invoices: [],
          serviceHistory: normalizeServiceEntries(
            [{ name: normalizedServiceName, isCustom: normalizedServiceName === "Custom" }],
            normalizedServiceName,
            new Date(),
          ).map((entry, index) => ({
            id: `svc-${customerId}-${index + 1}`,
            ...entry,
          })),
          profile: createEmptyCustomerProfile({
            onboardingStatus: "needs_follow_up",
            intakeSource: "invoice",
            referralSource: "Created from invoice",
            billingNotes: "Minimal customer created during invoice drafting.",
            onboardedAt: new Date().toISOString(),
          }),
        }
      : {
          ...existingCustomer,
          services: existingCustomer.services.includes(normalizedServiceName)
            ? existingCustomer.services
            : [...existingCustomer.services, normalizedServiceName],
          serviceHistory: existingCustomer.services.includes(normalizedServiceName)
            ? existingCustomer.serviceHistory
            : [
                {
                  id: `svc-${customerId}-${crypto.randomUUID()}`,
                  name: normalizedServiceName,
                  code: null,
                  isCustom: normalizedServiceName === "Custom",
                  enrolledAt: formatTimestamp(new Date()),
                },
                ...existingCustomer.serviceHistory,
              ],
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
          referral_bonus_amount,
          zelle_amount,
          card_amount,
          due_date,
          status,
          source,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
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
        invoice.referralBonusAmount ?? 0,
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

    await reconcileOpenTransactions(client);

    return {
      state: await hydratePortalState(client),
      message: sendNow ? "Invoice created and sent." : "Draft invoice saved.",
    };
  });
}

export async function confirmPendingPaymentRecord(paymentId) {
  return withTransaction(async (client) => {
    const paymentRow = await fetchPendingPaymentForUpdate(client, paymentId);
    if (!paymentRow) {
      throw new Error("Payment not found in the confirmation queue.");
    }

    if (!paymentRow.customer_id) {
      throw new Error("Customer record not found for this payment.");
    }

    const duplicatePayment = await findConfirmedDuplicatePayment(client, paymentRow);
    if (duplicatePayment) {
      return movePaymentToDuplicateException(client, paymentRow, duplicatePayment);
    }

    const customer = await fetchCustomerAggregate(client, paymentRow.customer_id);
    if (!customer) {
      throw new Error("Customer record not found for this payment.");
    }

    const invoice = await resolveInvoiceForPayment(client, paymentRow);

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
            match_status = 'applied',
            applied_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [paymentId],
    );

    const awardedRewards = await awardReferralRewardsForCustomer(client, customer.id);
    await insertActivity(client, `Transaction applied for ${customer.name}`);
    for (const reward of awardedRewards) {
      await insertActivity(
        client,
        `Referral bonus unlocked: ${formatCurrency(reward.amount)} for ${reward.referrerCustomerId}`,
      );
    }

    return {
      applied: true,
      state: await hydratePortalState(client),
      message: `Transaction applied for ${customer.name}. Receipt can be sent separately.`,
    };
  });
}

export async function sendReceiptForPaymentRecord(paymentId, deliverReceipt) {
  return withTransaction(async (client) => {
    const paymentRow = await fetchConfirmedPaymentForUpdate(client, paymentId);
    if (!paymentRow) {
      throw new Error("Completed transaction not found.");
    }

    if (!paymentRow.customer_id) {
      throw new Error("Customer record not found for this payment.");
    }

    const customer = await fetchCustomerAggregate(client, paymentRow.customer_id);
    if (!customer) {
      throw new Error("Customer record not found for this payment.");
    }

    const recipient = findPrimaryEmail(customer);
    if (!recipient) {
      throw new Error("No primary customer email is available for this receipt.");
    }

    const invoice = await resolveInvoiceForPayment(client, paymentRow);
    const payment = mapPaymentRow(paymentRow);
    const wasAlreadySent = Boolean(paymentRow.receipt_sent_at);

    await deliverReceipt({ customer, payment, invoice, recipient });

    await client.query(
      `
        UPDATE payments
        SET receipt_sent_to_email = $2,
            receipt_sent_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [paymentId, recipient],
    );

    await insertActivity(
      client,
      wasAlreadySent
        ? `Receipt re-sent to ${customer.name}`
        : `Receipt emailed to ${customer.name}`,
    );

    return {
      state: await hydratePortalState(client),
      message: wasAlreadySent
        ? `Receipt re-sent to ${recipient}`
        : `Receipt emailed to ${recipient}`,
    };
  });
}

export async function resolveExceptionRecord({
  exceptionId,
  actionType,
  candidateCustomerId,
  saveAlias = false,
  actingUsername = "unknown",
}) {
  return withTransaction(async (client) => {
    const exception = await fetchExceptionForUpdate(client, exceptionId);
    if (!exception) {
      throw new Error("Exception item not found.");
    }

    const allowedActionsByKind = {
      ambiguous: new Set(["matched_customer"]),
      unmatched: new Set(["matched_customer"]),
      mismatch: new Set(["accept_full", "apply_credit"]),
      duplicate: new Set(["mark_duplicate"]),
    };

    if (!allowedActionsByKind[exception.kind]?.has(actionType)) {
      throw new Error("This exception action is not supported for the current review state.");
    }

    let resolutionMessage = "Exception resolved.";
    let resolvedCustomerId = null;
    let resolvedPaymentRow = null;

    if (exception.kind === "duplicate" && actionType === "mark_duplicate") {
      if (exception.source_message_id) {
        await client.query(
          `
            UPDATE payments
            SET review_status = 'history',
                match_status = 'unmatched',
                review_notes = COALESCE(review_notes, 'Marked as duplicate by finance ops.'),
                updated_at = NOW()
            WHERE source_message_id = $1
          `,
          [exception.source_message_id],
        );
        resolvedPaymentRow = await fetchPaymentBySourceMessage(client, exception.source_message_id);
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

      await insertExceptionResolutionHistory(client, {
        exception,
        paymentRow: resolvedPaymentRow,
        resolutionAction: actionType,
        resolutionMessage: "Duplicate transaction archived.",
        resolvedByUsername: actingUsername,
      });
      await insertActivity(client, `${exception.sender_name} resolved: ${actionType}`, actingUsername);
      return {
        state: await hydratePortalState(client),
        message: "Duplicate transaction archived.",
      };
    }

    if (actionType === "matched_customer" && !candidateCustomerId) {
      throw new Error("Choose an existing customer before resolving this exception.");
    }

    if (actionType === "matched_customer" && !exception.source_message_id) {
      throw new Error("This exception is missing its source transaction reference.");
    }

    if (actionType === "matched_customer" && candidateCustomerId && exception.source_message_id) {
      const candidate = await fetchCustomerAggregate(client, candidateCustomerId);
      if (!candidate) {
        throw new Error("Selected customer record was not found.");
      }

      if (saveAlias) {
        await upsertZelleAlias(
          client,
          candidateCustomerId,
          {
            name: exception.alias_name ?? exception.sender_name ?? candidate.name,
            email: exception.sender_email ?? null,
            phoneLast4: exception.sender_phone_last4 ?? null,
          },
          candidate.name,
        );
      }

      const invoiceResult = await client.query(
        `
          SELECT id
          FROM invoices
          WHERE customer_id = $1
            AND status IN ('sent', 'overdue')
            AND ROUND(zelle_amount, 2) = ROUND($2::numeric, 2)
          ORDER BY due_date DESC, created_at DESC, id DESC
          LIMIT 1
        `,
        [candidateCustomerId, Number(exception.amount || 0)],
      );

      const paymentUpdateResult = await client.query(
        `
          UPDATE payments
          SET customer_id = $2,
              customer_name = $3,
              invoice_id = $4,
              matched_signals = $5::text[],
              score = 100,
              review_status = 'pending',
              match_status = 'matched',
              match_summary = $6,
              updated_at = NOW()
          WHERE source_message_id = $1
          RETURNING *
        `,
        [
          exception.source_message_id,
          candidateCustomerId,
          candidate?.name ?? null,
          invoiceResult.rows[0]?.id ?? null,
          invoiceResult.rowCount ? ["manual_selection", "amount"] : ["manual_selection"],
          invoiceResult.rowCount
            ? "Customer selected manually and transaction is ready to apply."
            : "Customer selected manually. Review and apply the transaction.",
        ],
      );

      if (!paymentUpdateResult.rowCount) {
        throw new Error("The linked transaction could not be updated for this customer.");
      }

      resolvedCustomerId = candidateCustomerId;
      resolvedPaymentRow = paymentUpdateResult.rows[0];

      resolutionMessage = invoiceResult.rowCount
        ? `Matched to ${candidate.name} and moved to Payments to confirm.`
        : `Assigned to ${candidate.name} and moved to Payments to confirm.`;
    }

    if (exception.kind === "mismatch" && exception.invoice_id && actionType === "accept_full") {
      const invoiceResult = await client.query(
        `
          SELECT invoices.customer_id, customers.full_name AS customer_name
          FROM invoices
          JOIN customers ON customers.id = invoices.customer_id
          WHERE invoices.id = $1
          LIMIT 1
        `,
        [exception.invoice_id],
      );

      if (!invoiceResult.rowCount || !exception.source_message_id) {
        throw new Error("This mismatch no longer has a linked invoice transaction to prepare.");
      }

      const paymentUpdateResult = await client.query(
          `
            UPDATE payments
            SET customer_id = $2,
                customer_name = $3,
                invoice_id = $4,
                matched_signals = ARRAY['manual_override', 'amount']::text[],
                score = 100,
                review_status = 'pending',
                match_status = 'matched',
                match_summary = 'Prepared as a manual full-payment override. Apply the transaction to complete.',
                updated_at = NOW()
            WHERE source_message_id = $1
            RETURNING *
          `,
        [
          exception.source_message_id,
          invoiceResult.rows[0].customer_id,
          invoiceResult.rows[0].customer_name,
          exception.invoice_id,
        ],
      );

      if (!paymentUpdateResult.rowCount) {
        throw new Error("The linked transaction could not be prepared from this mismatch.");
      }

      resolvedCustomerId = invoiceResult.rows[0].customer_id;
      resolvedPaymentRow = paymentUpdateResult.rows[0];
      resolutionMessage = "Mismatch accepted and moved to Payments to confirm.";
    }

    if (exception.kind === "mismatch" && actionType === "apply_credit" && exception.source_message_id) {
      const paymentUpdateResult = await client.query(
        `
          UPDATE payments
          SET review_notes = 'Operator chose to apply overpayment as future credit.',
              updated_at = NOW()
          WHERE source_message_id = $1
          RETURNING *
        `,
        [exception.source_message_id],
      );

      if (!paymentUpdateResult.rowCount) {
        throw new Error("The linked transaction could not be updated for credit handling.");
      }

      resolvedPaymentRow = paymentUpdateResult.rows[0];
      resolvedCustomerId = paymentUpdateResult.rows[0].customer_id ?? null;
      resolutionMessage = "Transaction left on record for future credit handling.";
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

    if (!resolvedPaymentRow && exception.source_message_id) {
      resolvedPaymentRow = await fetchPaymentBySourceMessage(client, exception.source_message_id);
    }

    await insertExceptionResolutionHistory(client, {
      exception,
      paymentRow: resolvedPaymentRow,
      resolutionAction: actionType,
      resolutionMessage,
      resolvedByUsername: actingUsername,
      resolvedCustomerId,
    });
    await insertActivity(client, `${exception.sender_name} resolved: ${actionType}`, actingUsername);

    return {
      state: await hydratePortalState(client),
      message: resolutionMessage,
    };
  });
}

export async function updateReferralProgramSettings(config, actingUsername = "unknown") {
  return withTransaction(async (client) => {
    const normalized = await upsertReferralProgramConfig(client, config);
    await insertActivity(client, "Referral program settings updated", actingUsername);
    return {
      state: await hydratePortalState(client),
      message: normalized.enabled
        ? "Referral program settings saved."
        : "Referral program disabled for new referrals.",
    };
  });
}

export async function updateGmailAutoSyncSettings(config, actingUsername = "unknown") {
  const intervalMinutes = Number(config?.intervalMinutes);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
    throw new Error("Gmail sync interval must be between 1 and 1,440 minutes.");
  }

  return withTransaction(async (client) => {
    const existingResult = await client.query(`
      SELECT state_json
      FROM integration_states
      WHERE integration_key = 'gmail'
      FOR UPDATE
    `);
    const existingState = normalizeGmailIntegrationState(existingResult.rows[0]?.state_json ?? {});
    const normalizedSettings = normalizeGmailAutoSyncSettings({
      ...existingState.autoSyncSettings,
      enabled: Boolean(config.enabled),
      intervalMinutes,
      updatedAt: new Date().toISOString(),
      updatedBy: actingUsername,
    });

    await upsertGmailIntegrationState(client, {
      autoSyncSettings: normalizedSettings,
    });
    await insertActivity(client, "Gmail auto-sync settings updated", actingUsername);

    return {
      state: await hydratePortalState(client),
      message: normalizedSettings.enabled
        ? `Gmail auto-sync will run every ${normalizedSettings.intervalMinutes} minute${normalizedSettings.intervalMinutes === 1 ? "" : "s"}.`
        : "Gmail auto-sync paused.",
    };
  });
}

export async function convertReferralSubmissionToRelationship(submissionId, actingUsername = "unknown") {
  return withTransaction(async (client) => {
    const submission = await fetchReferralSubmissionForUpdate(client, submissionId);
    if (!submission) {
      throw new Error("Referral submission not found.");
    }

    if (submission.status !== "submitted") {
      throw new Error("This referral submission has already been reviewed.");
    }

    const matchedCustomer =
      (submission.matched_customer_id
        ? { id: submission.matched_customer_id }
        : await findCustomerByReferralContact(client, {
            email: submission.referred_email,
            phoneDigits: submission.referred_phone_digits,
          })) ?? null;

    if (!matchedCustomer?.id) {
      throw new Error("No matching customer exists yet for this referral. Finish onboarding first.");
    }

    const existingReferral = await findExistingReferralForCustomer(client, matchedCustomer.id);
    let referralId = existingReferral?.id ?? null;
    if (existingReferral && existingReferral.referrer_customer_id !== submission.referrer_customer_id) {
      throw new Error("This customer is already attached to a different referrer.");
    }

    if (!referralId) {
      referralId = await upsertCustomerReferral(client, {
        referrerCustomerId: submission.referrer_customer_id,
        referredCustomerId: matchedCustomer.id,
        relationshipLabel: submission.relationship_label ?? null,
        referredOn: submission.submitted_at,
        notes: submission.notes ?? "Public referral form",
      });
    }

    await markReferralSubmissionConverted(client, {
      submissionId,
      matchedCustomerId: matchedCustomer.id,
      convertedCustomerId: matchedCustomer.id,
      convertedReferralId: referralId,
      actingUsername,
    });

    await insertActivity(
      client,
      `Referral submission converted for ${submission.referred_full_name}`,
      actingUsername,
    );

    return {
      state: await hydratePortalState(client),
      message: `${submission.referred_full_name} is now tracked inside the referral program.`,
    };
  });
}

export async function dismissReferralSubmission(submissionId, actingUsername = "unknown") {
  return withTransaction(async (client) => {
    const submission = await dismissReferralSubmissionRecord(client, {
      submissionId,
      actingUsername,
      reviewNotes: "Dismissed from referral intake dashboard.",
    });

    if (!submission) {
      throw new Error("This referral submission is no longer waiting for review.");
    }

    await insertActivity(
      client,
      `Referral submission dismissed for ${submission.referred_full_name}`,
      actingUsername,
    );

    return {
      state: await hydratePortalState(client),
      message: `${submission.referred_full_name} was removed from the open referral intake queue.`,
    };
  });
}

export async function applyReferralRewardToInvoice(rewardId, actingUsername = "unknown") {
  return withTransaction(async (client) => {
    const rewardRow = await fetchReferralRewardForUpdate(client, rewardId);
    if (!rewardRow) {
      throw new Error("Referral bonus record not found.");
    }

    if (rewardRow.status !== "available") {
      throw new Error("This referral bonus is no longer waiting to be applied.");
    }

    const invoiceRow = await findNextDraftInvoiceForCustomer(client, rewardRow.customer_id);
    if (!invoiceRow) {
      throw new Error("No draft invoice is available yet for this customer. Create the next invoice first.");
    }

    const invoice = mapInvoiceRow(invoiceRow);
    const rewardAmount = roundCurrency(rewardRow.amount);
    const availableInvoiceBalance = Math.min(
      Number(invoice.zelleAmount || 0),
      Number(invoice.cardAmount || 0),
    );

    if (availableInvoiceBalance <= 0) {
      throw new Error("The next draft invoice is already fully discounted.");
    }

    if (availableInvoiceBalance + 0.0001 < rewardAmount) {
      throw new Error(
        `The next draft invoice only has ${formatCurrency(availableInvoiceBalance)} left to discount. Adjust the invoice or wait for a larger draft invoice before applying this bonus.`,
      );
    }

    const applicationId = `ira-${crypto.randomUUID()}`;
    await client.query(
      `
        INSERT INTO invoice_reward_applications (
          id,
          invoice_id,
          reward_id,
          customer_id,
          reward_type,
          amount_applied,
          applied_by_username,
          created_at
        )
        VALUES ($1, $2, $3, $4, 'referral_bonus', $5, $6, NOW())
      `,
      [
        applicationId,
        invoice.id,
        rewardRow.id,
        rewardRow.customer_id,
        rewardAmount,
        actingUsername,
      ],
    );

    await client.query(
      `
        UPDATE invoices
        SET referral_bonus_amount = COALESCE(referral_bonus_amount, 0) + $2,
            zelle_amount = GREATEST(0, ROUND((zelle_amount - $2)::numeric, 2)),
            card_amount = GREATEST(0, ROUND((card_amount - $2)::numeric, 2)),
            updated_at = NOW()
        WHERE id = $1
      `,
      [invoice.id, rewardAmount],
    );

    await client.query(
      `
        UPDATE customer_reward_ledger
        SET status = 'applied',
            applied_at = NOW(),
            applied_invoice_id = $2,
            applied_by_username = $3
        WHERE id = $1
      `,
      [rewardRow.id, invoice.id, actingUsername],
    );

    if (rewardRow.referral_id) {
      await client.query(
        `
          UPDATE customer_referrals
          SET status = 'awarded',
              awarded_at = COALESCE(awarded_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
        `,
        [rewardRow.referral_id],
      );
    }

    await insertActivity(
      client,
      `Referral bonus ${formatCurrency(rewardAmount)} applied to invoice ${invoice.invoiceCode}`,
      actingUsername,
    );

    return {
      state: await hydratePortalState(client),
      message: `${formatCurrency(rewardAmount)} referral bonus applied to invoice ${invoice.invoiceCode}.`,
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
            review_notes,
            duplicate_of_payment_id,
            date_label,
            raw_text,
            received_at,
            review_status,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23, $24, $25, $26, $27, $28, $29, NOW(), NOW()
          )
          ON CONFLICT (id)
          DO UPDATE
          SET customer_id = EXCLUDED.customer_id,
              invoice_id = EXCLUDED.invoice_id,
              customer_name = EXCLUDED.customer_name,
              sender_name_raw = EXCLUDED.sender_name_raw,
              sender_email = EXCLUDED.sender_email,
              sender_phone_last4 = EXCLUDED.sender_phone_last4,
              amount_received = EXCLUDED.amount_received,
              matched_signals = EXCLUDED.matched_signals,
              score = EXCLUDED.score,
              source_message_id = EXCLUDED.source_message_id,
              source_provider = EXCLUDED.source_provider,
              source_thread_id = EXCLUDED.source_thread_id,
              message_from_email = EXCLUDED.message_from_email,
              message_to_email = EXCLUDED.message_to_email,
              message_date_header = EXCLUDED.message_date_header,
              transaction_date = EXCLUDED.transaction_date,
              subject = EXCLUDED.subject,
              transaction_reference = EXCLUDED.transaction_reference,
              memo = EXCLUDED.memo,
              parsed_payload = EXCLUDED.parsed_payload,
              match_status = EXCLUDED.match_status,
              match_summary = EXCLUDED.match_summary,
              review_notes = EXCLUDED.review_notes,
              duplicate_of_payment_id = EXCLUDED.duplicate_of_payment_id,
              date_label = EXCLUDED.date_label,
              raw_text = EXCLUDED.raw_text,
              received_at = EXCLUDED.received_at,
              review_status = EXCLUDED.review_status,
              updated_at = NOW()
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
          payment.matchStatus ?? (payment.reviewStatus === "pending" ? "matched" : "unmatched"),
          payment.matchSummary ?? null,
          payment.reviewNotes ?? null,
          payment.duplicateOfPaymentId ?? null,
          payment.dateLabel ?? null,
          payment.rawText ?? null,
          payment.receivedAt ?? null,
          payment.reviewStatus,
        ],
      );
    }

    for (const exception of syncResult.exceptionsToInsert ?? []) {
      await upsertExceptionFromMatch(client, exception);
    }

    await upsertGmailIntegrationState(client, {
      lastSyncAt: syncResult.syncedAt ?? new Date().toISOString(),
      lastSyncSummary: syncResult.summary ?? null,
    });

    return hydratePortalState(client);
  });
}
