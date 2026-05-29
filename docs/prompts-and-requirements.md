# Prompts and Requirements History

This file captures the product-driving directives that shaped the current implementation so the repo preserves not just code, but also intent.

## Source artifacts

Initial design and requirement artifacts:

- [files/phase1_prototype.html](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/files/phase1_prototype.html)
- [files/setu_phase1_requirements.html](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/files/setu_phase1_requirements.html)

## Implementation prompts that changed scope

The build evolved through these concrete asks:

1. Start building the product from the prototype and requirements.
2. Host the product locally first.
3. In the new invoice flow, replace the customer list with search by:
   - phone
   - email
   - first name
   - last name
4. Add predefined services per member in the new invoice flow.
5. Make invoice and receipt actions capable of real email delivery.
6. Add parsing for Zelle confirmation emails.
7. Add login/password protection to the portal.
8. Replace the file-based backend store with a Postgres backend designed for:
   - strong performance
   - cost efficiency
   - growth beyond a single portal into a broader product suite
9. Add a standalone client onboarding step as the first part of the operating flow so key billing and payment-match information is captured before invoicing.
10. Make onboarding service selection support:
   - mandatory service capture
   - EB1A criteria checkbox defaults
   - custom services
   - dated service-enrollment history
11. Capture complete Zelle transaction details in one place for human review and one-click apply.
12. Add stable customer IDs plus a configurable referral bonus mechanism with admin controls.
13. Package the repo with updated wireframes, non-technical requirements, process flow, and AWS deployment design.
14. Add a simpler dashboard chart that shows time-series sums of amounts received with day, week, month, and year drill controls, defaulting to month.
15. Redesign customer search to feel more like an Excel-style register, with clearly defined customer status.
16. Open a full 360 customer view when a finance user clicks a customer, including signup date, transaction history, referrals, and contract context.

## Current interpretation of the requirements

The codebase now implements the following current-state requirements:

- local full-stack operation
- protected portal access
- Postgres as the operational source of truth
- standalone client onboarding as the first workflow step
- stable customer IDs for future cross-product reference
- manual and queue-based invoice workflows
- searchable member selection in new invoice
- member-specific service selection
- dated service enrollment history with later add-ons
- SMTP-backed invoice and receipt sending path
- Gmail-backed inbox sync path for Zelle confirmations
- full transaction-detail capture for Zelle-like payments
- exception routing for mismatch and ambiguity cases
- referral program configuration, tracking, and reward ledger
- customer search across identity fields and invoice code
- spreadsheet-style customer register with explicit customer-status visibility
- customer 360 view with onboarding, billing, payments, referrals, and working contract context
- dashboard received-amount trend drill-down by day, week, month, and year

## Requirements that are still intentionally deferred

- public customer portal
- multi-tenant workspace model
- async job queue for mail and sync
- production deployment configuration
- analytics warehouse / reporting pipeline

## How to use this file

When future contributors ask “why does this system work this way?”, this file should be read together with:

- [README.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/README.md)
- [docs/architecture.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/architecture.md)
- [docs/process-flow.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/process-flow.md)
- [docs/non-technical-requirements.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/non-technical-requirements.md)
- [docs/aws-solution-architecture.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/aws-solution-architecture.md)
- [docs/design-system.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/design-system.md)
