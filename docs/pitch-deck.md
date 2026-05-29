# Setu Finance Business Pitch Deck

This is the business-story version of Setu Finance for leadership, finance operations, and program stakeholders.

## Slide 1: Title

- Setu Finance
- Finance operations system for onboarding, invoicing, payment review, and receipts
- Current state: working local product with real inbox sync, Postgres backend, and PDF receipt delivery

## Slide 2: The Business Problem

- Client onboarding, invoicing, Zelle confirmations, receipts, and referral tracking often live across separate tools.
- Teams lose time re-keying customer details and reconciling inbox threads to invoices.
- Payment mistakes create operational risk because finance teams need a clean audit trail before they post money.

## Slide 3: What Setu Finance Solves

- Creates one operating path from client onboarding to invoice creation to payment capture to receipt delivery.
- Converts Zelle confirmation emails into structured transactions instead of leaving them buried in inboxes.
- Keeps a human in the final payment-apply step while still reducing manual work.

## Slide 4: Simple Process Flow

1. Onboard client
2. Create customer record and service history
3. Create and send invoice
4. Sync or save transaction details
5. Match customer and invoice
6. Route to `Payments to confirm` or `Exceptions`
7. Human clicks `Apply transaction`
8. Move to completed transactions and send or re-send PDF receipt

## Slide 5: Core Feature Pillars

- Client onboarding with required identity details, optional address, referral source, and dated service history
- Spreadsheet-style customer search with status indicators and a full 360 customer view
- Invoice workflow tied to enrolled services and saved customer details
- Gmail-based Zelle sync with structured capture of amount, memo, transaction number, dates, and raw extract
- Duplicate-payment controls, human review queues, and separate receipt sending

## Slide 6: Controls and Auditability

- Payments are saved before they are applied.
- Duplicate transactions are blocked from being counted twice.
- Exceptions can be reassigned to existing customers manually.
- Completed transactions remain visible so finance can send or re-send receipts without touching the ledger again.
- Referral qualification rules are configurable and snapshot-based for historical integrity.

## Slide 7: What Already Works

- Login-protected portal
- Postgres-backed customer, invoice, payment, referral, and activity data
- Gmail inbox sync for `You received money with Zelle`
- Matching engine with confirm queue and exception handling
- PDF receipt generation and outbound email delivery
- Dashboard received-amount trend views by day, week, month, and year

## Slide 8: Business Value

- Faster collections operations because finance works from one queue-based system
- Fewer reconciliation mistakes because payment evidence is structured and reviewable
- Better customer experience because invoices and receipts come from one controlled workflow
- Better management visibility through customer statuses, dashboard summaries, and transaction history

## Slide 9: Growth Path

- Expand from a finance portal into a broader product suite with tenant-ready customer IDs and append-only history
- Move background sync and outbound email into AWS-managed queues and jobs as volume grows
- Add broader payment sources, customer contracts, and more advanced analytics without changing the operating model

## Slide 10: Ask

- Approve Setu Finance as the finance operations foundation
- Use the current product as the working blueprint for phase-two production hardening
- Prioritize deployment, admin tooling, and broader payment-source integrations next
