# Setu Finance Skills And Capability Map

Last updated: June 7, 2026

This file documents the current operational skills supported by the Setu Finance portal.

## Finance Operations

- Onboard clients from signed contracts.
- Parse contract fields into client profile, services, fee, installments, and service-start date.
- Create, send, and track invoices.
- Sync Zelle confirmation emails from Gmail.
- Record manual secured payments.
- Review payment matches and exceptions.
- Apply transactions once and prevent duplicate counting.
- Send or re-send PDF receipts after payment application.

## Contract Operations

- Search client, employee, stakeholder, NDA, offer letter, and HR agreement files.
- View signed-with party, compact summary, and signed date.
- Quick peek supported files through authenticated API preview routes.
- Download raw contract files intentionally.
- Keep S3/private object storage hidden behind backend auth.

## People And Payables

- Onboard employees with controlled department/title/region values.
- Search employee directory without listing all employees by default.
- Open employee 360 pages.
- Upload employee contracts.
- Record employee payments.
- Generate and download employee payslips.
- Track employee referral payouts and other expenses/income through Payables.

## Referral Engine

- Accept public no-login referrals.
- Match referrers by email, phone, or employee ID.
- Require finance review before relationship/reward creation.
- Route customer rewards to invoice discounts.
- Route employee rewards to Payables.

## AskSetu

- Answer read-only questions from current portal state.
- Supports customers, invoices, payments, exceptions, contracts, employees, payslips, payables, Gmail sync, outbound email, referrals, and recent activity.
- Does not mutate data, sync Gmail, apply payments, send receipts, or download files automatically.

## Safety And Audit Skills

- Preserve login/auth audit history without storing secrets.
- Preserve exception resolution history with actor and timestamp.
- Keep payment application and receipt sending separate.
- Keep contract files private while allowing authenticated preview/download.

