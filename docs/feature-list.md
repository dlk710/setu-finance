# Setu Finance Feature List

This is the current end-to-end feature inventory for Setu Finance.

## 1. Client Onboarding

- Dedicated contract-first onboarding workflow before billing starts
- Full-width onboarding experience for cleaner finance intake on laptop screens
- Multi-contract upload section during onboarding
- Contract preview parsing for services, fee, installments, service-start date, and key contact details
- Manual override support before save so admins can correct or add fields after parsing
- Required fields: first name, last name, primary email, mobile phone, and at least one service
- Optional home address capture
- Optional billing notes, referral source, and Zelle identity hints
- Stable numeric customer IDs for reuse across future products
- Timestamped service enrollment history
- Support for later add-on enrollments without losing prior history
- Compact short-name service list for faster finance intake
- Fee-type support for one-time and recurring engagements with billing rows generated accordingly

## 2. Customer Records And Search

- Search by customer ID, first name, last name, email, phone, aliases, and invoice references
- Spreadsheet-style customer register
- Clear status per customer: active, draft queued, awaiting payment, overdue, payment ready, duplicate review, mismatch, or needs follow-up
- Full customer 360 view with:
  - signup and onboarding details
  - contact details
  - home address
  - contract records and downloadable contract files
  - contract-derived critical fields such as start date, fee, and installment count
  - service history
  - invoice ledger
  - transaction ledger
  - referral relationships and rewards
  - current billing context
- Full-page routed 360 view instead of a popout, so browser back and forward work cleanly

## 3. Invoicing

- New invoice flow linked to existing customer records
- Searchable customer picker in invoice creation
- Service choices limited to the customer’s enrolled services plus `Custom`
- Contract-derived invoice schedule generation during onboarding
- Draft, sent, paid, and overdue invoice states
- Numeric invoice numbers
- Invoice email sending support
- Zelle and card payment instructions in invoice communications

## 4. Payment Capture And Sync

- Gmail sync for Zelle confirmation emails
- Sync limited to the desired Zelle subject pattern
- Incremental sync windows with overlap protection
- Automatic Gmail sync every 5 minutes when credentials are configured
- Admin-configurable Gmail sync interval and enable/disable switch
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
- Immutable exception history after resolution, including:
  - action taken
  - resolved customer record
  - resolving portal user
  - timestamp of the decision
- Manual exception resolution to:
  - select the correct existing customer
  - save a Zelle alias for future matching
  - move the transaction forward for apply while attaching it to the selected customer history immediately
  - explicitly accept a linked exception when finance confirms it is a valid payment
  - archive a duplicate when finance confirms it should not be counted
- Same Zelle transaction number reuse is blocked and labeled as a possible abuse/replay risk
- Manual secured-payment entry for funds confirmed outside Gmail sync, including alternate route, date, reference, memo, and internal notes

## 6. Payment Application And Receipts

- Human-controlled `Apply transaction` action
- Human-controlled `Record manual payment` action for bank transfer, manually verified Zelle, check, cash, card, or other secured routes
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
- Dashboard is the default landing page for signed-in users
- Time-series received-amount chart
- Day, week, month, and year drilldowns
- Duplicate-blocked payments excluded from totals
- Activity history for major finance events

## 8. Referral Program

- Referral relationship capture during onboarding
- Relationship label and referral date captured per referred customer
- Admin-configurable referral bonus amount
- Admin-configurable qualification rule, program name, and program description
- Ability to disable the program for future enrollments
- Historical rule snapshots preserved per referral
- Qualified rewards shown in a dedicated review queue
- One-click `Apply referral bonus` action for finance
- Referral bonuses reduce the next draft invoice instead of creating direct customer credits
- Applied bonus history includes invoice reference, applied date, and user attribution
- Dashboard reporting includes referral counts and total bonus spent

## 9. Public Feedback Intake

- Public no-login `/feedback` form for customers, prospects, and test users
- Captures name, email, optional customer ID, optional phone, feedback category, optional rating, and message
- Supports up to 3 optional attachments for screenshots, PDFs, or supporting files
- Stores feedback in PostgreSQL with review status
- Shows feedback in the admin workspace for review
- Admins can mark feedback reviewed or archived
- Attachment payloads are protected and downloaded only through authenticated admin endpoints
- GitHub Issues remain an internal engineering follow-up path, not the public feedback intake channel

## 10. Admin, Security, And Auditability

- Portal login required before finance data is visible
- Browser tab uses the product name `Setu.Finance`
- Sidebar `setu` brand acts as a home link back to the dashboard
- Activity log for major actions
- Exception resolution trail with actor attribution
- Durable transaction history
- Human approval before final payment apply
- Customer primary email as the source of truth for receipt delivery

## 11. Architecture And Platform Readiness

- React + Vite frontend
- Express API backend
- PostgreSQL as the system of record
- Local contract binary storage in development
- Private S3-ready contract storage path for cloud environments
- Gmail OAuth inbox integration
- SMTP-based outbound email
- Normalized data model designed to expand into a larger product suite
