# Setu Finance Functional Test Plan

Last updated: June 7, 2026

This test plan is written for QA, finance testers, and business reviewers. It describes expected functionality by area.

## 1. Smoke Tests

| Test | Expected Result |
| --- | --- |
| Open `/` | Portal landing loads. |
| Open `/dashboard` | Executive dashboard loads after login. |
| Open `/clients` | Clients workspace loads. |
| Open `/receivables` | Receivables workspace loads with tabs. |
| Open `/payables` | Payables workspace loads. |
| Open `/people` | People workspace loads with Onboard Employee above Employee Directory. |
| Open `/contracts` | Contracts archive loads with contract counts and search/filter controls. |
| Open `/referrals` | Referral Program admin workspace loads. |
| Open `/settings` | Settings loads. |
| Open `/audit` | Audit loads. |
| Open `/refer` | Public referral form loads without login. |
| Open `/feedback` | Public feedback form loads without login. |

## 2. Contracts Archive

| Test | Expected Result |
| --- | --- |
| Open Contracts | Table shows Contract, Category, Signed with, Summary, Signed date, and actions. |
| Check client contract row | Signed with shows the client/customer name, for example Lohith Deshpande when that customer owns the contract. |
| Check employee contract row | Signed with shows employee name. |
| Check Summary column | Summary is short and scannable, not a long raw extracted text block. |
| Check Signed date | Parsed/entered signed date appears when captured; otherwise clear not-captured text appears. |
| Verify removed column | Internal storage/uploader column is not shown in the main table. |
| Search by signed-with name | Matching client/employee contract rows appear. |
| Search by contract type | Matching rows appear for NDA, offer letter, client contract, employee contract, etc. |
| Filter by category | Only selected category appears. |
| Click Quick peek | Modal opens and previews supported PDF/image/text through `/preview`. |
| Click Download | Raw file downloads through `/download`. |
| Verify S3-safe design | No public S3 URL is exposed in the browser; preview/download use Setu API routes. |

## 3. People

| Test | Expected Result |
| --- | --- |
| Open People | Onboard Employee appears above Employee Directory. |
| Directory before search | No employee list is shown before search. |
| Search employee by name/email/phone/department/title/region | Top 10 matching employees appear. |
| Open Employee 360 | Full routed employee page opens. |
| Upload employee contract | File is saved and appears in Employee 360 plus Contracts archive. |
| Record employee payment | Payment appears in employee 360 and Payables. |
| Generate payslip | Payslip record is created from matching employee payments. |
| Download payslip PDF | Authenticated PDF download works. |

## 4. Client Onboarding And Customer 360

| Test | Expected Result |
| --- | --- |
| Upload signed contract during onboarding | Parser pre-fills services, fee, installments, and dates where possible. |
| Save required client fields | Customer record is created with numeric customer ID. |
| Open customer 360 | Signup, contacts, address, services, contracts, invoices, payments, exceptions, and referrals are visible. |
| Add later service enrollment | New service history is appended with date/time. |

## 5. Receivables

| Test | Expected Result |
| --- | --- |
| Create invoice | Numeric invoice is created for selected customer/service. |
| Send invoice | Outbound email status is respected and invoice status updates. |
| Sync Zelle inbox | Relevant Zelle emails are parsed; nonmatching subjects are ignored. |
| Payments to confirm | Clear matches appear for human apply. |
| Apply transaction | Payment and invoice/customer ledger update once. |
| Send receipt | Receipt PDF is sent separately after apply. |
| Duplicate Zelle reference | Duplicate/replay-risk is blocked and not counted. |
| Manual secured payment | Verified non-Gmail funds can be recorded and applied with audit trail. |

## 6. Exceptions

| Test | Expected Result |
| --- | --- |
| Review exception | Details and raw extract access are available. |
| Assign to existing customer | Payment/customer relationship updates. |
| Accept valid exception | Non-duplicate payment can move forward/apply. |
| Reject/archive | Record moves to archived bucket and is excluded from totals. |
| Delete archived | Requires checkbox, `DELETE`, and reason; preserves audit history. |

## 7. Referrals

| Test | Expected Result |
| --- | --- |
| Submit `/refer` as employee | Employee ID searches employee DB only. |
| Submit `/refer` by email/phone | Employee and customer DB lookup can match. |
| New intake | Finance review is required before relationship/reward exists. |
| Approve referral | Relationship is established. |
| Qualify customer referrer | Reward becomes invoice discount. |
| Qualify employee referrer | Reward routes to Payables. |
| Reject duplicate/self-referral | Record is retained as rejected/duplicate history. |

## 8. Payables

| Test | Expected Result |
| --- | --- |
| View employee payment totals | Employee payment totals and regional distribution show. |
| View employee referral payouts | Employee referral payout ledger appears. |
| Record other paid expense | Paid expense appears in payables reporting. |
| Record other received income/refund | Received entry appears separately from paid expenses. |

## 9. AskSetu

| Test | Expected Result |
| --- | --- |
| Ask `help` | Supported answer areas are listed. |
| Ask `Show contracts signed with Lohith Deshpande` | Contract file, type, signed-with party, signed date, and compact summary are returned. |
| Ask `How many employees are active?` | Total/current/former employee counts are returned. |
| Ask `Summarize payables by region` | Employee payments, referral payouts, other paid, and other received totals are returned. |
| Ask customer name | Customer finance summary is returned. |
| Ask invoice number | Invoice status, amount, and due date are returned. |
| Ask payment reference | Payment status and amount are returned. |

## 10. Verification Commands

Run these before release:

```bash
npm run db:migrate
npm run build
node --check server/stateStore.js
node --check server/index.js
node --check src/lib/askSetu.js
```

Route smoke:

```bash
for path in / /dashboard /clients /receivables /payables /people /contracts /referrals /settings /audit /refer /feedback; do
  /usr/bin/curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" "http://127.0.0.1:4173$path"
done
```

