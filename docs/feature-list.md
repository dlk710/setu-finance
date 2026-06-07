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

- v2 `Executive` section is the default signed-in finance landing page
- Existing `/dashboard` route and dashboard read model remain valid
- Collection metrics and queue visibility
- Time-series received-amount chart
- Day, week, month, and year drilldowns
- Duplicate-blocked payments excluded from totals
- Activity history for major finance events

## 8. Referral Program

- Referral relationship capture during onboarding
- Public no-login Referral Engine at `/refer`
- Public referral submissions are linked to normalized referral parties behind the scenes
- Referrers can identify themselves by email, phone, or employee ID
- Email and phone lookup searches employee and customer records after explicit consent
- Employee ID lookup searches only the employee database
- Unknown referrers can still submit for manual finance identity review
- Every new referral intake requires finance-admin review before any relationship or reward is established
- Duplicate referred-client contact and self-referral controls prevent obvious abuse
- Referral relationships carry unique referral codes using the `REF-YYYY-000001` format
- Referral legitimacy metadata supports pending review, verified, rejected, and abuse-flagged states
- Referral lifecycle events preserve audit history for future review and payout controls
- Relationship label and referral date captured per referred customer
- Admin-configurable referral bonus amount
- Admin-configurable qualification rule, program name, and program description
- Ability to disable the program for future enrollments
- Historical rule snapshots preserved per referral
- Qualified rewards shown in a dedicated review queue
- One-click `Apply referral bonus` action for finance
- Referral bonuses reduce the next draft invoice instead of creating direct customer credits
- Employee referral rewards route to the employee payables ledger instead of customer invoice discounts
- Applied bonus history includes invoice reference, applied date, and user attribution
- Dashboard reporting includes referral counts and total bonus spent

## 9. People And Employee Ledger

- Dedicated `People` section for finance and HR-style employee administration
- People landing is grouped around `Employee Directory` and `Onboard Employee`
- `Onboard Employee` is shown above the directory so HR can add a person without browsing existing records
- Employee count metrics summarize total, current, paid transactions, and former employees
- Employee Directory does not list all employees by default, which keeps the page usable for 300+ employees
- Directory results appear only after search/filter input and are capped to the top 10 most relevant matches
- Employee directory search supports first name, last name, employee ID, email, phone, department, title, status, and region
- Department, title, and region use controlled dropdown values
- Supported regions are US, India, and Nigeria, with local payroll currency USD, INR, and NGN
- Employee onboarding with assigned employee ID
- Captures first, middle, last, and preferred name
- Captures personal and official email, personal and official mobile, region, department, manager, title, and employment type
- Captures joining date, termination or exit date, promotion date, HR comments, and status
- Tracks monthly salary, one-time joining bonus, annual bonus, currency, and salary-effective date
- Maintains employees separately from customers while allowing referral matching across both populations
- Employee 360 opens as a routed full page from the directory and shows profile, compensation context, referral totals, payment history, and payslips
- Employee 360 supports uploading signed offer letters, NDAs, employment agreements, policy acknowledgements, and other HR files
- Employee contracts are searchable from the central Contracts library and downloadable from employee 360
- Former employees are maintained in a separate former-employee table/view and shown separately from active directory rows
- Employee payment ledger records salary, joining bonus, annual bonus, referral payout, reimbursement, commission, severance, and adjustment payments
- Payslips can be generated by calendar month or custom pay cycle from recorded employee payments
- Generated employee payslips can be downloaded as authenticated PDF files for sharing with the employee
- Payables summarizes employee payments by region

## 10. Contracts Library

- Dedicated authenticated `Contracts` workspace for finance, HR, and admin users
- Search-only archive across client, employee, stakeholder, vendor, NDA, offer letter, and other contract records
- Contract records are grouped by category, signed-with party, short summary, signed date, and explicit actions
- Client contracts show the client/customer name the contract is signed with, such as Lohith Deshpande
- Employee contracts show the employee name the contract is signed with
- Contract summaries are intentionally compact so the list remains scannable
- Client contract records come from client onboarding and customer 360 uploads
- Employee contract records come from employee 360 uploads in People
- Contracts library itself does not upload files, preventing accidental orphaned contract records
- `Quick peek` opens supported PDFs, images, and text files inline through the authenticated API before a user downloads anything
- Download links are protected by admin authentication
- Storage keys are categorized by owner type, owner ID, and date so local storage can map directly to a private S3 bucket design

## 11. Other Expenses And Income

- Dedicated `Other` entry path inside Payables
- Supports expenses such as laptops, software, rent, leases, travel, marketing, insurance, taxes, legal, accounting, utilities, and miscellaneous categories
- Supports received entries such as refunds, reimbursements, rebates, grants, and other income
- Captures vendor/source, amount with cents, currency, category, direction, region, department, date, reference, memo, and recording user
- Other entries roll into Payables reporting so leadership can see money out and money received outside invoices

## 12. V2 Finance Information Architecture

- New v2 shell navigation: `Executive`, `Clients`, `Receivables`, `Payables`, `Referrals`, `People`, `Contracts`, `Settings`, and `Audit`
- Workday-style global search in the authenticated shell for fast navigation across pages, tasks, customers, employees, invoices, payments, referrals, contracts, and feedback
- Search suggestions are grouped by category and can be opened with click or Enter
- Global search supports first-three-letter task matching, full-text keyword matching, and direct customer/employee 360 deeplinks
- Search result selection is navigation-only and does not automatically sync Gmail, apply payments, create invoices, or send receipts
- Legacy operational routes are preserved: `/dashboard`, `/billing`, `/customers`, `/customers/:id`, `/onboarding`, `/admin`, and `/settings`
- New aliases are available for the merged IA: `/clients`, `/receivables`, `/referrals`, `/payables`, `/people`, and `/audit`
- `Clients` wraps existing onboarding, customer register, and customer 360 flows without changing their backend contracts
- `Receivables` wraps the existing billing console and keeps Gmail/Zelle sync, payment application, exception review, manual payment entry, and receipt sending intact
- Receivables is organized into tabs for `Overview`, `Invoices`, `Payments to confirm`, `Exceptions`, `Receipts`, and `Inbox sync` so finance users can move through one queue at a time
- `Payables`, `People`, `Referrals`, and `Audit` are active product-suite surfaces while preserving existing receivables flows
- `Contracts` centralizes searchable client and employee files without introducing a separate upload path
- Existing Gmail sync credentials, token path, SMTP settings, and sync services are preserved

## 13. Public Feedback Intake

- Public no-login `/feedback` form for customers, prospects, and test users
- Captures name, email, optional customer ID, optional phone, feedback category, optional rating, and message
- Supports up to 3 optional attachments for screenshots, PDFs, or supporting files
- Stores feedback in PostgreSQL with review status
- Shows feedback in the admin workspace for review
- Admins can mark feedback reviewed or archived
- Attachment payloads are protected and downloaded only through authenticated admin endpoints
- GitHub Issues remain an internal engineering follow-up path, not the public feedback intake channel

## 14. Admin, Security, And Auditability

- Portal login required before finance data is visible
- Browser tab uses the product name `Setu.Finance`
- Sidebar `setu` brand acts as a home link back to the dashboard
- Activity log for major actions
- Exception resolution trail with actor attribution
- Durable transaction history
- Human approval before final payment apply
- Customer primary email as the source of truth for receipt delivery

## 15. Architecture And Platform Readiness

- React + Vite frontend
- Express API backend
- PostgreSQL as the system of record
- Local contract binary storage in development
- Private S3-ready contract storage path for cloud environments
- Gmail OAuth inbox integration
- SMTP-based outbound email
- Normalized data model designed to expand into a larger product suite
