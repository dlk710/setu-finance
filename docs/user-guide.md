# Setu Finance User Guide

This guide explains how to use the Setu Finance portal by function. It is written for finance operators, admins, and business users.

## 1. Access The Portal

Use this when you need to sign in and start work.

1. Open the portal.
   - Local: `http://127.0.0.1:4173`
   - AWS dev primary: `https://3.135.234.59.sslip.io`
   - AWS dev recovery: `https://18.218.196.158.sslip.io`
2. Enter the portal username.
   - Default username: `admin`
3. Enter the portal password configured by the admin.
4. After login, the portal opens on the Dashboard.
5. Click the `setu` logo anytime to return to the Dashboard.

Security note: do not store real production passwords in GitHub documents. Keep passwords in `.env`, AWS SSM Parameter Store, or AWS Secrets Manager.

## 2. Dashboard

Use this to understand the current finance position.

1. Open `Dashboard` from the left navigation.
2. Review the top summary cards for collections, outstanding balances, active customers, pending payments, and exceptions.
3. Review the received-amount chart.
4. Use the day, week, month, and year controls to change the chart drilldown.
5. Review referral chart and bonus-spend summary.
6. Use the dashboard as the starting point for daily finance review.

What to watch:

- `Payments to confirm` means money was captured and matched, but still needs human apply.
- `Exceptions` means the system needs a human decision.
- Duplicate or replay-risk transactions are not counted in totals.

## 3. Client Onboarding

Use this when a new client signs up or when an existing client adds services.

1. Open `Client onboarding`.
2. Start with `Contract intake`.
3. Upload signed contract files if available.
4. Review the fields prefilled from the contract.
5. Confirm or correct:
   - first name
   - last name
   - primary email
   - phone
   - enrolled services
   - fee type
   - billing cadence
   - service start date
   - invoice schedule
6. Add optional details if available:
   - home address
   - billing notes
   - referral source
   - Zelle sender alias
7. Select all services the client enrolled for.
8. Use `Custom` if the service is not in the default list.
9. Confirm enrollment date/time for each service.
10. Review generated invoice schedule.
11. Click save/onboard to create or update the customer.

Important rules:

- First name, last name, email, phone, and services are mandatory.
- Service history is append-only; later services should be added with their own enrollment date.
- Uploaded contracts remain linked to the customer 360 page.

## 4. Customer Search

Use this to find customers quickly.

1. Open `Customer search`.
2. Search by any of these:
   - customer ID
   - first name
   - last name
   - email
   - phone
   - alias
3. Review the spreadsheet-like results.
4. Check the customer status column.
5. Click a customer row to open the full customer 360 page.

Useful statuses:

- `Active`: customer is in normal active state.
- `Awaiting payment`: invoice was sent and payment is pending.
- `Payment ready`: payment is ready for finance apply.
- `Overdue`: invoice is overdue.
- `Duplicate review`: payment needs duplicate review.
- `Mismatch`: payment amount does not match expected amount.
- `Needs follow-up`: onboarding or billing details are incomplete.

## 5. Customer 360 View

Use this to see the full customer history.

1. Open a customer from `Customer search`.
2. Review customer identity and contact details.
3. Review signup/onboarding date.
4. Review enrolled services and service history.
5. Review contracts and extracted critical fields.
6. Review invoices.
7. Review payments and completed transaction history.
8. Review open exceptions linked to the customer.
9. Review resolved exception history.
10. Review referral relationships and reward status.
11. Use browser back/forward to move between customer pages and portal sections.

## 6. Create And Send Invoice

Use this when you need to invoice a customer.

1. Open `Billing console`.
2. Click `New invoice`.
3. Search for the customer by phone, email, first name, last name, or customer ID.
4. Select the customer.
5. Choose the service.
6. Enter or confirm:
   - milestone
   - base amount
   - discount percentage
   - due date
7. Review Zelle amount and card amount.
8. Choose whether to save as draft or send now.
9. If sending now, confirm the customer email is correct.
10. Send the invoice.

Important rules:

- Invoice numbers are numeric.
- Referral bonuses reduce invoice amount through invoice discounting.
- Invoice email uses the configured outbound email account.

## 7. Send Due Invoices

Use this during daily billing review.

1. Open `Billing console`.
2. Go to `Due to send today`.
3. Review each invoice in the queue.
4. Click `Send` for a single invoice.
5. Or click `Send all` if every due invoice is ready.
6. Confirm the queue updates after sending.

## 8. Sync Zelle Inbox

Use this to pull Zelle confirmation emails into the portal.

1. Open `Billing console`.
2. Click `Sync Zelle inbox`.
3. Wait for the sync result.
4. Review newly captured records in:
   - `Payments to confirm`
   - `Exceptions`
5. If no new payments appear, check sync settings and Gmail authorization in `Settings`.
6. If sync reports `Gmail authorization expired or was revoked`, run `npm run gmail:authorize` locally and retry sync.

What the sync captures:

- amount with exact cents
- sent date
- transaction number
- memo
- sender name
- Gmail message/thread details
- raw extracted text

Important rules:

- The sync only reads relevant Zelle subject patterns.
- Previously processed Gmail messages are skipped.
- Same Zelle transaction number cannot be applied twice.

## 9. Review And Apply Payments

Use this when a payment is matched and ready for finance approval.

1. Open `Billing console`.
2. Go to `Payments to confirm`.
3. Review the customer, invoice, amount, transaction number, memo, and match score.
4. Click `Review & apply`.
5. Confirm details in the review modal.
6. Click `Apply transaction`.
7. The payment moves to `Completed transactions`.
8. Invoice status updates if the payment matches an invoice.
9. Referral qualification updates if applicable.

Important rules:

- Applying payment and sending receipt are separate actions.
- Do not apply if the customer, amount, or transaction details look wrong.

## 10. Resolve Exceptions

Use this when the system cannot safely auto-match or apply a payment.

1. Open `Billing console`.
2. Go to `Exceptions`.
3. Click `Review`.
4. Read the transaction details and reason.
5. Click `Approve & apply` only when the funds and customer are correct.
6. If the customer is unclear, search for the existing customer and either `Approve & apply` or `Assign only`.
7. Click `Reject / archive` when the record should not be applied.
8. Review rejected records in `Rejected / archived bucket`.
9. Delete from the archived bucket only after checking the confirmation box, typing `DELETE`, and entering a reason.
10. If the same Zelle transaction number already exists, treat it as possible abuse/replay risk.
11. After resolution, confirm the action is visible in exception history.

Important rules:

- Duplicate exceptions cannot be accepted/applied.
- Same Zelle transaction number must never be applied twice.
- Rejected and archived records are retained in the bucket; delete is a soft-delete with audit history, not silent data loss.
- Every exception action is saved with the user and timestamp.

## 11. Record Manual Secured Payment

Use this when funds are confirmed outside Gmail/Zelle email sync.

1. Open `Billing console`.
2. Click `Record manual payment`.
3. Search and select the customer.
4. Enter amount received.
5. Select payment date.
6. Choose how funds were secured:
   - Zelle verified outside Gmail sync
   - bank transfer
   - check
   - cash
   - card processor
   - other secured route
7. Enter transaction or confirmation number if available.
8. Select invoice if known.
9. Add memo.
10. Add internal verification note.
11. Click `Record & apply payment`.
12. Send receipt later from `Completed transactions`.

Important rules:

- Manual payment is for verified funds only.
- If a Zelle transaction number already exists, the portal blocks it as possible abuse/replay risk.
- Manual payments are auditable and labeled by payment route.

## 12. Send Or Re-Send Receipt

Use this after a payment has been applied.

1. Open `Billing console`.
2. Go to `Completed transactions`.
3. Find the payment.
4. Check receipt status.
5. Click `Send receipt`.
6. If already sent, click `Re-send receipt` when needed.
7. The receipt goes to the customer primary email.
8. Confirm receipt status updates.

Receipt includes:

- customer name
- customer ID
- amount
- transaction/reference number
- payment date
- memo
- invoice reference when available
- receipt timestamp
- PDF attachment

## 13. Referral Program

Use this to manage referral relationships and bonuses.

1. Open `Referral Program`.
2. Review referral rules at the top.
3. Review who referred whom.
4. Check relationship label and referral date.
5. Review qualification status.
6. For qualified rewards, review the green available bonus section.
7. Click `Apply referral bonus` to apply the bonus to the next eligible draft invoice.
8. Confirm the invoice shows a lower payable amount.

Important rules:

- Referral bonus is not paid directly to customers.
- Referral bonus is applied as a discount on an invoice.
- Rules are configurable in `Settings`.
- Historical referrals preserve the rule snapshot active when created.

## 14. Public Referral Form

Use this when customers submit referrals without logging in.

1. Share `/refer` with customers when needed.
2. Customer enters referrer and referred-person details.
3. Portal blocks duplicate submissions by referred email or phone.
4. Finance reviews submissions in the referral/admin workflow.
5. Convert valid submissions when the referred person becomes a customer.

## 15. Public Feedback Form

Use this when customers, prospects, or test users need a simple place to share feedback.

1. Share `/feedback` with users.
2. User enters name, email, optional customer ID, optional phone, feedback area, optional rating, and feedback message.
3. User may attach up to 3 optional files, such as screenshots or PDFs.
4. The portal saves the feedback into the admin review queue.
5. Admin opens `Referral Program` and reviews the `User feedback` section.
6. Admin opens any uploaded attachment when more context is needed.
7. Admin marks the feedback as reviewed or archives it.
8. If engineering follow-up is needed, admins can separately create a GitHub Issue from the reviewed feedback.

Important rules:

- Do not ask customers to use GitHub Issues directly for sensitive billing or payment details.
- Use GitHub Issues for internal engineering follow-up, not as the primary public feedback intake.
- Attachments should be used only when helpful and should not include unnecessary sensitive data.

## 16. Settings

Use this for admin-controlled configuration.

1. Open the user/profile area.
2. Click `Settings`.
3. Review Gmail auto-sync settings.
4. Enable or disable auto-sync.
5. Change sync interval if needed.
6. Review referral-program rules.
7. Update bonus amount, qualification threshold, or program enabled state.
8. Save changes.

Admin notes:

- Gmail sync defaults to every 5 minutes when enabled.
- Changes are stored in the backend database.
- Production secrets should be managed outside Git.

## 17. Daily Operating Checklist

Use this each business day.

1. Open Dashboard.
2. Review exceptions and payment counts.
3. Send due invoices.
4. Sync Zelle inbox if needed.
5. Review `Payments to confirm`.
6. Resolve `Exceptions`.
7. Apply valid payments.
8. Send receipts for completed payments.
9. Review referral rewards.
10. Check customer records that need follow-up.
11. Review new user feedback.

## 18. Safety Checklist

Before applying money:

1. Confirm customer identity.
2. Confirm amount and cents.
3. Confirm transaction/reference number.
4. Confirm invoice if applicable.
5. Confirm it is not duplicate or replay-risk.
6. Apply transaction only after funds are verified.
7. Send receipt only after the payment is applied.

If anything looks wrong:

- leave it in `Exceptions`
- add/retain notes
- verify against bank or Gmail source
- do not apply duplicate Zelle transaction numbers
