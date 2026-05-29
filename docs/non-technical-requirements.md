# Setu Finance Non-Technical Requirements

## Purpose

Setu Finance should give the operations team one place to onboard clients, bill them, capture payments, review exceptions, and send receipts without depending on disconnected spreadsheets, inboxes, and manual memory.

## Primary Users

- Finance operations staff who onboard clients, create invoices, and apply payments
- Program administrators who manage referral rules and policy settings
- Leadership users who need a clean dashboard of collections, outstanding balances, and operational issues

## Business Outcomes

- Reduce manual re-entry between onboarding, invoicing, payment review, and receipt sending
- Keep a durable history of client enrollments, billing activity, and payment decisions
- Make Zelle-based collections easier to reconcile without removing human control over final posting
- Support future expansion into a broader product suite by using stable customer IDs and reusable customer records

## Required Business Capabilities

### 1. Client onboarding must happen first

- The system must let staff create or update a client profile before invoicing begins.
- First name, last name, primary email, phone number, and at least one service enrollment must be required.
- Home address should be available as an optional field for future billing and compliance needs.
- Each enrolled service must keep the date and time when that service was added.
- The system must allow clients to enroll in additional services later without losing historical enrollment records.

### 2. Client records must be reusable

- Every client must have a stable customer ID that can be used across finance and future product modules.
- The client record must support multiple contact details and payment identity hints.
- Search must work across name, email, phone, aliases, and invoice references.
- The customer register should show a clearly defined status for each customer so finance can tell at a glance whether the record is active, awaiting payment, overdue, or needs review.
- Clicking a customer should open a full 360 view with signup date, contact details, service history, invoices, transaction history, referrals, rewards, and current billing or contract context.

### 3. Invoicing must be fast and controlled

- Staff must be able to create invoices from an existing client record.
- The invoice flow should use the client’s enrolled services as the default choices.
- The system should support draft, sent, paid, and overdue invoice states.
- The system must support invoice email sending.

### 4. Payment capture must be structured

- The system must store incoming payment transactions in a dedicated transaction record.
- When a Zelle confirmation email is synced, the portal must capture as much structured information as possible in one place, including:
  - transaction date
  - transaction number
  - amount
  - memo
  - email sender details available from the message
  - destination inbox details
  - raw extracted message text for audit and review
- Captured transactions must remain saved even if they are not immediately applied.

### 5. Matching must support human review

- The matching engine should identify the most likely customer and invoice using saved customer information and invoice context.
- Clear matches should appear in a `Payments to confirm` queue.
- Unclear or mismatched transactions should appear in an `Exceptions` queue.
- A finance user must be able to complete the final apply step with one click.
- Applying a transaction must update the account, invoice state, and activity history together.

### 6. Receipts must be sent from the client record

- Once a payment is applied, the system must send the receipt to the customer’s primary email from the database.
- Receipt communication must include the payment details that matter to the client and the operations team.

### 7. Dashboard visibility must support simple finance review

- Leadership and finance users should be able to see amounts received over time in one dashboard view.
- The dashboard should let users switch the received-amount chart between day, week, month, and year ranges.
- The chart must use date or period on the x-axis and summed received amounts on the y-axis.
- Duplicate-blocked transactions must not be counted in those received totals.

### 8. Referral program rules must be configurable

- The system must support referral relationships between existing and newly onboarded clients.
- Referral bonuses should default to `$500`, but the amount must be configurable by admins.
- Qualification should default to `at least $3,000 paid or 6 months`, but both values must be configurable by admins.
- Admins must be able to disable the referral program for new enrollments without deleting historical referral records.
- Historical referral records must preserve the rule snapshot active when the referral was created.

### 9. The portal must be safe for internal finance work

- The portal must require login before finance data is visible.
- Payment application must stay human-controlled.
- Important state changes should be traceable in system history.

## Non-Functional Expectations

- The system should stay affordable to run at low volume.
- The product should be ready to grow into a suite, not just a single billing page.
- The design should favor auditability and explainability over opaque automation.
- The architecture should support later addition of bank APIs, job queues, and multi-tenant models.

## Out of Scope for This Phase

- Public client self-service portal
- Fully automatic posting of payments without human review
- Multi-tenant customer isolation for multiple organizations
- Advanced analytics warehouse or BI platform
- Full bank API integration beyond the current Gmail/Zelle ingestion path

## Success Criteria

- A finance team member can onboard a client, send an invoice, review a synced Zelle transaction, apply it, and send a receipt without leaving the portal.
- A referred client can be linked to a referrer during onboarding and tracked until the reward becomes available.
- Leadership can see outstanding invoices, pending confirmations, exceptions, referral progress, and received-amount trends in one system.
