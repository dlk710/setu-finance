# AskSetu Current Capability Guide

Last updated: June 7, 2026

AskSetu is the lightweight in-portal assistant in the authenticated finance shell. It answers from the current portal read model already loaded in the browser. It does not call external AI services, does not mutate records, and does not run side effects such as syncing Gmail, applying payments, creating invoices, sending receipts, or downloading contracts.

## Design Intent

- Give finance users fast answers without leaving the current workspace.
- Keep cost low by using deterministic answers from local application state.
- Keep the assistant safe by making it read-only and side-effect free.
- Keep responses concise enough for operational use during billing, payment review, and HR/finance tasks.

## Supported Question Areas

| Area | Example Questions | Expected Answer |
| --- | --- | --- |
| Payments to confirm | `How many payments need review?` | Count and total value of pending payments. |
| Exceptions | `How many exceptions are open?` | Open exception count and top sender names. |
| Due invoices | `Who has due invoices today?` | Count, total value, and top customer names in due-to-send queue. |
| Customers | `Summarize Karthik Pamaraju` | Customer ID, signup date, services, open invoices, pending payments, exceptions, latest confirmed payment, and referral context. |
| Invoices | `What is invoice 100123?` | Invoice customer, status, Zelle amount, and due date. |
| Payments | `What happened to transaction 29358007012?` | Payment amount, sender/customer, and review/applied status. |
| Contracts | `Show contracts signed with Lohith Deshpande` | Matching contract file names, contract type, signed-with party, signed date, and compact summary. |
| People | `How many employees are active?` | Total employees, current employees, and former employees. |
| Employee 360 | `Summarize employee EMP-2026-000007` | Employee status, department, title, region, payment count, and payment total. |
| Payslips | `How many payslips are generated?` | Payslip count and where to download/generate them. |
| Payables | `Summarize payables by region` | Employee payment total, referral payout count, other paid total, and other received total. |
| Gmail sync | `What happened in the latest Gmail sync?` | Gmail readiness, last sync time, processed count, pending payments, exceptions, and auto-sync status. |
| Outbound email | `Is outbound email ready?` | Email readiness and configured from address when available. |
| Referrals | `What referral program is active?` | Program enabled state, bonus amount, qualification rule, active referral count, and reward count. |
| Activity | `What changed recently?` | Latest activity labels from the activity feed. |

## Search And Matching Rules

- Customer matching uses customer name, customer ID, email, phone, and aliases.
- Employee matching uses employee ID, first/middle/last/full name, official/personal email, official/personal mobile, department, title, region, and status.
- Contract matching uses file name, category, owner code, signed-with name, contract type, summary, notes, and signed date.
- Invoice matching uses numeric invoice references.
- Payment matching uses numeric transaction references.

## Boundaries

AskSetu should not:

- expose passwords, tokens, OAuth credentials, SMTP secrets, or API keys
- initiate Gmail sync
- apply or reject payments
- resolve exceptions
- create invoices
- send receipts
- upload, preview, or download contracts automatically
- make external network calls for answers

## Tester Checklist

1. Ask `help` and confirm AskSetu lists customers, contracts, employees, payables, Gmail, email, referrals, invoices, and payments.
2. Ask `Show contracts signed with Lohith Deshpande` and confirm it returns contract name, type, signed-with party, signed date, and short summary.
3. Ask `How many employees are active?` and confirm it returns total/current/former employee counts.
4. Ask `Summarize payables by region` and confirm it returns employee payments, referral payout count, other paid, and other received totals.
5. Ask for a known customer and confirm the answer references customer ID, services, invoices/payments, and referral context.
6. Ask for a known invoice number and confirm status/amount/due date.
7. Ask for a known payment reference and confirm amount and review/applied state.
8. Ask `What happened in the latest Gmail sync?` and confirm it reflects configured/authorized state accurately.

