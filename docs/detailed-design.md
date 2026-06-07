# Setu Finance Detailed Design

Last updated: June 7, 2026

## 1. Product Scope

Setu Finance is the finance operations layer for the Setu product suite. It supports contract-first client onboarding, invoice creation, payment review, receipt generation, customer 360, referral review/reward routing, employee finance records, payables, contract archive, feedback intake, settings, audit, and AskSetu.

## 2. Information Architecture

| Area | Purpose | Primary Data |
| --- | --- | --- |
| Executive | Leadership dashboard and daily finance summary | dashboard projections, invoices, payments, referrals, employee payments |
| Clients | Client onboarding, customer register, and customer 360 | customers, contacts, profiles, services, invoices, payments, contracts |
| Receivables | Invoices, Zelle sync, payment review, exceptions, manual payments, receipts | invoices, payments, exceptions, processed messages |
| Payables | Employee payments, referral payouts, operating expenses, received refunds/income | employee payments, referral payouts, other expenses |
| Referrals | Referral rules, public intake review, relationship tracking, rewards, feedback | referral intake, referral parties, referrals, rewards, feedback |
| People | Employee onboarding, employee directory, employee 360, contracts, payslips | employees, employee payments, employee payslips, business contracts |
| Contracts | Searchable authenticated archive for client and employee files | customer contracts, business contracts, storage metadata |
| Settings | Gmail auto-sync, outbound email status, referral settings, access | integration state, system settings |
| Audit | Activity, auth audit, referral events, exception history | activity events, auth audit, referral events, exception resolution history |
| Public Referral | No-login referral submission | referral intake |
| Public Feedback | No-login feedback submission with optional attachments | feedback submissions |

## 3. Contracts Design

Contracts is a search-only archive. It does not upload files directly. Files enter the archive from:

- client onboarding or customer 360 for client contracts
- employee 360 in People for offer letters, NDAs, employee agreements, policy acknowledgements, and HR files

The table shows:

- `Contract`: file name, contract type, file size
- `Category`: client, employee, stakeholder, other
- `Signed with`: client name for client contracts and employee name for employee contracts
- `Summary`: compact parsed or admin-entered summary
- `Signed date`: parsed/entered contract signed date
- actions: `Quick peek` and `Download`

Quick peek streams supported files through authenticated backend preview endpoints:

- `/api/contracts/:id/preview`
- `/api/business-contracts/:id/preview`

Download streams raw files through authenticated download endpoints:

- `/api/contracts/:id/download`
- `/api/business-contracts/:id/download`

AWS design: contract files can sit in a private encrypted S3 bucket by owner category, owner ID, and date. Browser users do not need public S3 URLs because the API retrieves private objects and streams previews/downloads after portal authentication.

## 4. People And Payables Design

People stores employees separately from customers. The directory is search-first and does not list all employees by default, which keeps the page usable at 300+ employees.

Employee onboarding captures:

- employee ID
- first, middle, last, and preferred name
- personal and official email
- personal and official mobile
- department, title, region, manager
- status and HR comments
- joining/exit dates
- monthly salary, one-time joining bonus, annual bonus
- critical information

Employee 360 shows profile, compensation, referral totals, payment transactions, uploaded employee contracts, and generated payslips. Payslip PDFs are generated from recorded employee payment records and downloaded through authenticated API routes.

Payables reports employee payments, employee referral payouts, other paid expenses, and other received income/refunds.

## 5. Referral Design

Public `/refer` creates referral intake records without login. Finance must review and approve before any relationship or reward is established.

Referrer lookup rules:

- email or phone searches employee and customer records
- employee ID searches employee records only
- unknown referrers can submit for manual identity review

Reward routing:

- customer referrer rewards become invoice discounts
- employee referrer rewards route to Payables
- rejected/duplicate/self-referral records remain as history

## 6. Payment Integrity Design

Payment apply is always human-controlled.

Controls:

- Gmail message IDs prevent reprocessing the same email.
- Zelle transaction references are checked before apply.
- Same Zelle transaction reference reuse is blocked as possible replay/abuse risk.
- Exceptions preserve action, actor, customer, payment, and timestamp.
- Applying a payment and sending a receipt are separate actions.
- Rejected/archived records do not count toward received totals.

## 7. AskSetu Design

AskSetu is deterministic and reads from the already-loaded portal state. It answers questions about customers, invoices, payments, exceptions, contracts, employees, payslips, payables, Gmail sync, outbound email, referrals, and recent activity.

AskSetu is intentionally read-only. It cannot sync Gmail, apply payments, send receipts, create invoices, or download files.

## 8. AWS Low-Cost Design

Minimum deployable shape:

- React/Vite frontend served by the existing web host or S3/CloudFront
- Express API on EC2/ECS/App Runner
- PostgreSQL as system of record
- Private S3 bucket for contracts and backups
- Gmail API for Zelle sync
- SMTP/SES for outbound email
- CloudWatch logs
- EventBridge or app timer for scheduled Gmail sync

Cost control principles:

- keep AskSetu deterministic until true AI/RAG is needed
- keep contract objects private and stream through API
- use PostgreSQL indexes before introducing search infrastructure
- use S3 lifecycle rules for backups/archive storage

