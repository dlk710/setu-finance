# Setu Finance Feature List

This is the current end-to-end feature inventory for Setu Finance.

## 1. Client Onboarding

- Dedicated onboarding-first workflow before billing starts
- Required fields: first name, last name, primary email, mobile phone, and at least one service
- Optional home address capture
- Optional billing notes, referral source, and Zelle identity hints
- Stable numeric customer IDs for reuse across future products
- Timestamped service enrollment history
- Support for later add-on enrollments without losing prior history

## 2. Customer Records And Search

- Search by customer ID, first name, last name, email, phone, aliases, and invoice references
- Spreadsheet-style customer register
- Clear status per customer: active, draft queued, awaiting payment, overdue, payment ready, duplicate review, mismatch, or needs follow-up
- Full customer 360 view with:
  - signup and onboarding details
  - contact details
  - home address
  - service history
  - invoice ledger
  - transaction ledger
  - referral relationships and rewards
  - current billing context

## 3. Invoicing

- New invoice flow linked to existing customer records
- Searchable customer picker in invoice creation
- Service choices limited to the customer’s enrolled services plus `Custom`
- Draft, sent, paid, and overdue invoice states
- Numeric invoice numbers
- Invoice email sending support
- Zelle and card payment instructions in invoice communications

## 4. Payment Capture And Sync

- Gmail sync for Zelle confirmation emails
- Sync limited to the desired Zelle subject pattern
- Incremental sync windows with overlap protection
- Durable saved transaction records even before apply
- Captured transaction details include:
  - amount with exact cents
  - transaction date
  - transaction number
  - memo
  - sender identity hints
  - inbox sender and destination
  - raw extracted email text
  - parsed payload and source message identifiers

## 5. Matching And Exception Handling

- Deterministic matching engine using name, email, phone, aliases, amount, and invoice context
- `Payments to confirm` queue for clear matches
- `Exceptions` queue for mismatches, ambiguous payers, and duplicates
- Duplicate protection so one payment is not counted twice
- Manual exception resolution to:
  - select the correct existing customer
  - save a Zelle alias for future matching
  - move the transaction forward for apply

## 6. Payment Application And Receipts

- Human-controlled `Apply transaction` action
- Applying a payment updates transaction state, customer account state, invoice state, and activity history
- Completed transactions ledger after apply
- Separate `Send receipt` and `Re-send receipt` actions
- PDF receipt generation with:
  - customer name and customer ID
  - amount received
  - invoice reference if available
  - transaction number
  - payment date
  - memo
  - applied timestamp
  - receipt-issued timestamp
- Receipt send history stored in the transaction record

## 7. Dashboard And Reporting

- Finance dashboard with collection metrics and queue visibility
- Time-series received-amount chart
- Day, week, month, and year drilldowns
- Duplicate-blocked payments excluded from totals
- Activity history for major finance events

## 8. Referral Program

- Referral relationship capture during onboarding
- Admin-configurable referral bonus amount
- Admin-configurable qualification rule
- Ability to disable the program for future enrollments
- Historical rule snapshots preserved per referral
- Reward availability tracked in the ledger

## 9. Admin, Security, And Auditability

- Portal login required before finance data is visible
- Activity log for major actions
- Durable transaction history
- Human approval before final payment apply
- Customer primary email as the source of truth for receipt delivery

## 10. Architecture And Platform Readiness

- React + Vite frontend
- Express API backend
- PostgreSQL as the system of record
- Gmail OAuth inbox integration
- SMTP-based outbound email
- Normalized data model designed to expand into a larger product suite
