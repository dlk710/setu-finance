# Setu Finance Requirements Document

## 1. Product Objective

Setu Finance is an internal finance operations portal that starts from signed client contracts, creates accurate customer billing records, generates invoices, captures payments, manages payment exceptions, sends receipts, and tracks referral-program rewards. The product is designed as a foundation for a broader suite, so customer identity, contracts, invoices, payments, referrals, and audit history are modeled as reusable business records instead of one-off spreadsheet rows.

## 2. Scope

### In Scope

- Login-protected internal admin portal.
- Contract-first client onboarding.
- Customer profile creation and customer 360 view.
- Service enrollment history with required email, phone, first name, last name, and services.
- Invoice creation, draft schedules, email sending, and invoice status tracking.
- Gmail/Zelle payment sync, structured payment extraction, and payment matching.
- Manual secured-payment entry for funds verified outside Gmail sync.
- Payment exception review, assignment, acceptance for non-duplicate exceptions, duplicate archival, and durable exception history.
- Same Zelle transaction-number replay protection.
- PDF receipt generation and outbound receipt email.
- Configurable referral program with invoice-discount reward application.
- Public referral and feedback intake forms.
- Status-only provider engagement API for downstream applications.
- Dashboard reporting for payments, exceptions, invoices, and referral performance.
- PostgreSQL persistence with migration-managed schema.
- AWS-ready deployment model using low-cost services and an upgrade path.

### Out Of Scope For Current Phase

- Public customer self-service billing portal.
- Fully automatic payment posting without human review.
- Multi-organization tenant isolation.
- Advanced BI warehouse, ML forecasting, or third-party CRM replacement.
- Direct bank API posting through Chase or other bank APIs.
- Customer direct cash credits for referrals.

## 3. Personas And Responsibilities

| Persona | Responsibility | Primary Portal Areas |
| --- | --- | --- |
| Finance operator | Onboards customers, sends invoices, reviews payments, resolves exceptions, sends receipts | Onboarding, Billing console, Customers |
| Finance admin | Maintains referral rules, Gmail sync settings, operational settings | Settings, Referral Program |
| Leadership user | Reviews collections, outstanding work, referral performance, risk queues | Dashboard, Referral Program |
| Customer/member | Submits referrals and feedback without portal login | `/refer`, `/feedback` |
| Future integration worker | Runs background email sync, email sending, reconciliation, backups | AWS worker layer |

## 4. Functional Requirements

### 4.1 Authentication And Access

- The portal must require login before finance data is visible.
- The app must support configurable admin credentials through environment variables.
- The app must preserve authenticated browser sessions for normal operator work.
- Failed or unauthenticated API requests must return a safe error without leaking data.
- Machine-to-machine integration endpoints must use a separate `X-Api-Key` header and `INTEGRATION_API_KEY`, not the human portal login.
- The system must audit login/logout and integration API-key events without storing passwords, API-key values, tokens, session cookies, raw IP addresses, or raw user-agent strings.

### 4.2 Contract-First Onboarding

- Finance must be able to upload one or more signed contract files before saving onboarding.
- The parser should extract or prefill:
  - client name and contact hints when present
  - service names or short service labels
  - fee type, one-time fee, recurring fee, and billing cadence
  - installment schedule and due dates
  - service start date
  - important contract metadata for the customer 360 view
- Admins must be able to override all contract-derived values before saving.
- In AWS, contracts must be stored in a private S3 bucket path partitioned by customer ID/code and upload date.
- Locally, contract storage may use the filesystem while keeping the same API behavior.

### 4.3 Customer Records

- Customer ID must be stable and numeric; the current implementation uses 6-digit customer codes.
- Required fields:
  - first name
  - last name
  - primary email
  - primary phone
  - at least one enrolled service
- Optional fields:
  - home address
  - referral source
  - billing notes
  - Zelle alias hints
  - additional emails and phones
- Customer search must support first name, last name, email, phone, customer ID, and aliases.
- Customer status must be clear and finance-readable, such as active, draft queued, awaiting payment, payment ready, overdue, duplicate review, mismatch, or needs follow-up.
- Clicking a customer must open a full page customer 360 view, not a transient popover.
- Browser back and forward navigation must work across the v2 finance sections and legacy routes: Executive/dashboard, Clients/onboarding/customer register/customer 360, Receivables/billing, Referrals/referral program, Payables, People, Settings, and Audit.
- The Receivables workspace must separate the finance queues into clear tabs for overview, invoices, payments to confirm, exceptions, receipts, and inbox sync without removing the existing invoice, payment, exception, manual payment, sync, or receipt actions.

### 4.4 Services And Enrollment History

- Service selection should use compact short names for EB1A criteria and common offerings.
- Custom service entries must support free-form text.
- Every service enrollment must store the date/time when it became active.
- Later service enrollments must append history rather than overwrite the original service record.
- Customer 360 must show service history and active services.

### 4.5 Invoicing

- Finance must be able to create invoices from an existing customer record.
- New invoices must use a customer search bar instead of a static customer list.
- Invoice numbers must be numeric and stable.
- Invoice creation should prefill enrolled services for the selected customer.
- Contract-derived installments should create draft invoices during onboarding when available.
- Invoice statuses must include draft, sent, paid, and overdue.
- Referral bonuses must reduce invoice payable amounts as invoice discounts, not direct customer credits.
- Outbound invoice email must include payment instructions, including Zelle pay-to details.

### 4.6 Payment Capture

- Gmail sync must only process relevant Zelle payment emails, currently subject line pattern `You received money with Zelle`.
- Sync must be incremental and should use an overlap window to avoid missing late messages while avoiding deep reprocessing.
- Admins must be able to configure automatic sync on/off and interval from the portal settings.
- Zelle parser must preserve exact cents and must not round away decimal amounts.
- Structured Zelle capture must store:
  - amount
  - transaction number
  - sent date
  - memo
  - sender name
  - message sender email
  - message destination email
  - Gmail message/thread IDs
  - raw extracted message text
  - parsed payload
- Manual secured payment entry must support:
  - customer selection
  - amount received
  - payment date
  - payment route such as manually verified Zelle, bank transfer, check, cash, card, or other
  - transaction/reference number when available
  - memo
  - internal verification note
  - optional invoice selection
- Manual payment records must be auditable and must not pretend to be Gmail-synced records.

### 4.7 Matching And Exceptions

- The matching engine must use deterministic identity signals such as customer name, aliases, email, phone, amount, invoice context, and transaction reference.
- Clear matches should appear in `Payments to confirm`.
- Ambiguous, unmatched, mismatched, duplicate, or replay-risk transactions should appear in `Exceptions`.
- Finance must be able to match an exception to an existing customer.
- Matching an exception to a customer must attach the transaction to the customer history and move it forward for application.
- Finance may use `Accept transaction` only for linked non-duplicate exceptions where the transaction is valid.
- Duplicate exceptions must not expose an accept/apply action.
- Reused Zelle transaction numbers must be flagged as possible abuse/replay risk.
- Same Zelle transaction number must never be applied twice, including across Gmail sync and manually verified Zelle entry.
- Every exception resolution must preserve:
  - original exception kind
  - sender and transaction details
  - action taken
  - resolved customer
  - resolved payment
  - resolving user
  - timestamp

### 4.8 Payment Application And Receipts

- Applying a payment must be human-controlled.
- Applying a payment must update payment status, invoice status when matched, dashboard totals, customer 360, activity history, and referral qualification.
- Applying a payment and sending a receipt must remain separate actions.
- Completed transactions must remain visible after apply.
- Receipts must be sent to the customer primary email from the database.
- Receipt emails must include a PDF attachment.
- Receipt PDF must include:
  - customer name and customer ID
  - amount received
  - transaction number or manual reference
  - payment date
  - memo
  - invoice reference if available
  - receipt issued timestamp

### 4.9 Referral Program

- Referral rules must be configurable by admins.
- Defaults:
  - bonus amount: `$500`
  - qualification: `$3,000` paid or 6 months, whichever comes first
- Referral relationships must store:
  - referrer
  - normalized referrer party
  - referred customer
  - unique referral code
  - relationship label
  - referral date
  - rule snapshot at referral creation
  - legitimacy status and review notes
- The referral data model must support customer/client referrers now and remain extensible for employees, sales partners, and external partners later.
- Existing customer-referral links must remain intact through `referrer_customer_id` while the newer party linkage is added beside it.
- Referral lifecycle actions must be auditable through referral events.
- Referral bonuses must be applied as future invoice discounts.
- No direct cash or credit payout should be made outside invoice discounting.
- Qualified referral rewards should appear clearly in green/reviewable sections.
- Dashboard reporting should show referral counts, qualified referrals, and bonus spend.
- Public referral form must allow customers to submit referrals without login and must prevent duplicate submissions by referred email or phone.

### 4.10 Dashboard And Reporting

- The v2 `Executive` dashboard must default as the signed-in home page while the legacy `/dashboard` route remains valid.
- Dashboard should summarize:
  - collected amount
  - outstanding amount
  - expected amount
  - active customers
  - due invoices
  - payments to confirm
  - exceptions
  - referral activity and bonus spend
- Transaction chart must show sum of received amounts by day, week, month, or year, with month as default.
- Duplicate-blocked, archived, or replay-risk transactions must not count toward received totals.

### 4.11 Public Feedback Intake

- Users must be able to submit feedback without logging into the finance portal.
- Public feedback form must capture:
  - name
  - email
  - optional customer ID
  - optional phone
  - category
  - optional rating
  - message
  - optional attachments
- Attachments must be optional and size-limited.
- Feedback must be stored in PostgreSQL with status.
- Admins must be able to review feedback in the portal.
- Admins must be able to mark feedback reviewed or archived.
- Feedback attachments must not be embedded in the main portal state response.
- Feedback attachments must be available only through protected admin endpoints.
- GitHub Issues may be used for internal engineering follow-up, but must not be the primary public intake channel for sensitive customer feedback.

### 4.12 Settings

- Admin-facing settings should live under the user profile/settings area rather than cluttering the main operational workspace.
- Settings must include Gmail auto-sync enablement and interval.
- Settings must include referral-program rule maintenance.
- Settings should be designed to grow into email provider, storage, and backup controls.

### 4.13 Provider Engagement Status API

- Finance must expose `GET /api/integration/engagement-status` for downstream provider apps.
- The endpoint must require `X-Api-Key` and reject missing or incorrect keys with `401`.
- The endpoint must return only `customer_id`, `email`, `engagement_status`, and `as_of`.
- Engagement status must be one of `active`, `dormant`, or `inactive`.
- The default derived rule is:
  - `active`: no unpaid overdue invoices
  - `dormant`: unpaid overdue invoice exists and the oldest overdue date is within 30 days
  - `inactive`: unpaid overdue invoice exists and the oldest overdue date is older than 30 days
- The endpoint must not return payment amounts, invoice amounts, balances, line items, memos, raw email text, or transaction details.

### 4.14 Authentication Audit Logging

- Finance must record low-cost audit events for login success, login failure, logout, provider API-key success, and provider API-key failure.
- Audit rows must include event type, outcome, timestamp, username when available, request method/path, safe metadata, hashed IP, and hashed user-agent.
- Audit logging must never store passwords, API-key values, OAuth tokens, SMTP passwords, MFA codes, session cookies, raw IP addresses, or raw user-agent strings.
- Recent audit events must be visible in the Audit workspace for admin review.

## 5. Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Performance | Early-stage screens should load from indexed PostgreSQL queries and stay responsive for internal finance volume. |
| Cost | AWS design should keep fixed cost low and avoid Kubernetes, Redis, or warehouse services until scale requires them. |
| Reliability | Gmail sync should be incremental, idempotent, and safe to rerun. |
| Auditability | Payment application, exception resolution, referral reward application, and receipt sends must be traceable. |
| Security | Secrets must stay outside Git; cloud secrets should use SSM Parameter Store or Secrets Manager. |
| Integration privacy | Provider integrations must expose status-only data unless a future approved contract explicitly expands the payload. |
| Audit cost | Authentication audit logging should use PostgreSQL for the current stage and short-retention CloudWatch logs in AWS. |
| Data safety | Current low-cost deployment can tolerate some data loss, but backups should minimize loss windows. |
| Backup | PostgreSQL backups should run at least every 2 hours and land in private S3 with lifecycle transition to low-cost storage. |
| Extensibility | Schema should support future organizations, workspaces, bank integrations, and product modules. |
| Browser UX | Route-based navigation must support browser back and forward controls. |

## 6. Data And Integrity Rules

- Customer codes are unique and numeric.
- Invoice codes are unique and numeric.
- Payment source message IDs are unique when present.
- Confirmed payments with the same invoice cannot be double-counted.
- Confirmed Zelle transaction references are unique across Gmail, Zelle, and manually verified Zelle source scopes.
- `processed_messages` prevents the same Gmail message from being reprocessed as a new payment.
- Duplicate/replay-risk payments should be saved for review but excluded from confirmed totals.
- Referral rewards can be applied once and only to eligible draft invoices.
- Provider engagement status is derived from invoice status and due dates without selecting or returning amount columns.
- Auth audit metadata must be redacted before storage and must exclude sensitive auth material.

## 7. Acceptance Criteria

- Finance can upload a contract, review extracted billing details, save a customer, and generate draft invoices.
- Finance can send an invoice by email.
- Finance can sync Zelle emails and see parsed transactions with exact cents.
- A clear match appears in `Payments to confirm`.
- Provider engagement status returns `200` with a valid `X-Api-Key`, `401` without it, and no amount fields in the payload.
- Login success/failure, logout, and provider API-key success/failure appear in Audit without any stored password or API-key value.
- An ambiguous or mismatched payment appears in `Exceptions`.
- A reused Zelle transaction number appears as possible abuse/replay risk and cannot be accepted/applied.
- Finance can record a manually secured payment and later send a PDF receipt.
- Finance can send or re-send PDF receipts from completed transactions.
- Referral rules can be changed by admins, and qualified rewards apply as invoice discounts.
- Public feedback can be submitted from `/feedback` and reviewed by admins.
- Dashboard and customer 360 update after applied payments.
- Local and AWS deployments can run the same committed code.
