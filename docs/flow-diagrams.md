# Setu Finance Flow And Process Diagrams

This document collects the core process and system diagrams needed to explain Setu Finance to business, operations, and engineering teams.

## 1. Business User Flow

```mermaid
flowchart TD
    A["Finance logs in"] --> B["Dashboard home"]
    B --> C["Upload signed contract"]
    C --> D["Contract parser prefills customer, services, fees, installments"]
    D --> E["Finance reviews and overrides fields"]
    E --> F["Save customer and contract"]
    F --> G["Generate draft invoice schedule"]
    G --> H["Send invoice"]
    H --> I["Capture payment"]
    I --> J{"Payment source"}
    J -->|"Gmail Zelle sync"| K["Parse Zelle email"]
    J -->|"Funds verified outside inbox"| L["Record manual secured payment"]
    K --> M["Match customer and invoice"]
    L --> N["Apply manual payment"]
    M --> O{"Match result"}
    O -->|"Clear match"| P["Payments to confirm"]
    O -->|"Mismatch / ambiguous / duplicate"| Q["Exceptions"]
    P --> R["Finance applies transaction"]
    Q --> S["Finance reviews exception"]
    S -->|"Match customer"| P
    S -->|"Accept non-duplicate valid payment"| R
    S -->|"Archive duplicate / replay risk"| T["Resolved exception history"]
    R --> U["Completed transactions"]
    N --> U
    U --> V["Send or re-send PDF receipt"]
    V --> W["Customer 360, dashboard, referral progress update"]
```

## 2. Contract-To-Invoice Process

```mermaid
flowchart LR
    A["Contract upload"] --> B["Extract critical fields"]
    B --> C["Services and short labels"]
    B --> D["Fee type and billing cadence"]
    B --> E["Installments and due dates"]
    B --> F["Service start date"]
    C --> G["Onboarding form prefill"]
    D --> G
    E --> H["Draft invoice schedule"]
    F --> G
    G --> I["Admin review and override"]
    H --> I
    I --> J["Save customer"]
    J --> K["Store contract metadata"]
    K --> L["Contracts archive row"]
    L --> M["Quick peek through authenticated API"]
    L --> N["Download raw file when intentional"]
    J --> O["Create draft invoices"]
    K --> P["Customer 360 contract section"]
    O --> Q["Billing console due invoice queue"]
```

## 3. Payment Matching Process

```mermaid
flowchart TD
    A["Payment event saved"] --> B{"Has transaction reference?"}
    B -->|"Yes"| C["Check confirmed references"]
    C -->|"Same Zelle reference exists"| D["Block as possible abuse / replay risk"]
    C -->|"No confirmed reference conflict"| E["Evaluate customer identity"]
    B -->|"No"| E
    E --> F["Check name, alias, email, phone, amount, invoice"]
    F --> G{"Confidence"}
    G -->|"High confidence"| H["Payments to confirm"]
    G -->|"Ambiguous customer"| I["Ambiguous exception"]
    G -->|"No customer"| J["Unmatched exception"]
    G -->|"Amount mismatch"| K["Mismatch exception"]
    G -->|"Duplicate invoice / same sender amount date"| L["Duplicate exception"]
    H --> M["Finance applies transaction"]
    I --> N["Finance selects customer"]
    J --> N
    K --> O["Finance accepts valid non-duplicate payment or records credit path"]
    L --> P["Finance archives duplicate"]
    N --> H
    O --> M
    P --> Q["Resolution history"]
    D --> Q
    M --> R["Confirmed payment ledger"]
```

## 4. Exception Review Process

```mermaid
stateDiagram-v2
    [*] --> OpenException
    OpenException --> MatchedCustomer: assign existing customer
    MatchedCustomer --> PaymentsToConfirm: move forward for apply
    OpenException --> AcceptedTransaction: accept valid non-duplicate exception
    AcceptedTransaction --> ConfirmedLedger: apply immediately
    OpenException --> ArchivedDuplicate: archive duplicate or replay risk
    ArchivedDuplicate --> ResolutionHistory: preserve action, user, timestamp
    ConfirmedLedger --> ReceiptReady
    PaymentsToConfirm --> ConfirmedLedger: apply transaction
    ReceiptReady --> ReceiptSent: send PDF receipt
    ReceiptReady --> ReceiptResent: re-send PDF receipt
```

## 5. Manual Secured Payment Process

```mermaid
flowchart TD
    A["Finance verifies funds outside Gmail sync"] --> B["Open Record manual payment"]
    B --> C["Select customer"]
    C --> D["Enter amount, payment date, route, reference, memo, note"]
    D --> E{"Payment route"}
    E -->|"Manual Zelle"| F["Check Zelle reference uniqueness"]
    E -->|"Bank / check / cash / card / other"| G["Check applicable reference scope"]
    F -->|"Reference already confirmed"| H["Block and flag possible abuse / replay risk"]
    F -->|"Unique or blank"| I["Create manual payment record"]
    G --> I
    I --> J["Apply payment"]
    J --> K["Update invoice if matched"]
    K --> L["Completed transactions"]
    L --> M["Send receipt PDF separately"]
    H --> N["Exception history and review"]
```

## 6. Referral Engine And Reward Routing Process

```mermaid
flowchart TD
    A["Referrer opens /refer"] --> B{"How does referrer identify?"}
    B -->|"Email or phone"| C["Search employee and customer DB"]
    B -->|"Employee ID"| D["Search employee DB only"]
    B -->|"Not found"| E["Self-declared manual review"]
    C --> F{"Matched?"}
    D --> F
    F -->|"Yes"| G["Capture identity consent"]
    F -->|"No"| E
    G --> H["Select services and referred client contact"]
    E --> H
    H --> I{"Duplicate or self-referral?"}
    I -->|"Yes"| J["Save duplicate/rejected history; no reward"]
    I -->|"No"| K["Create referral_intake"]
    K --> L{"Initial status"}
    L -->|"Self-declared"| M["Pending identity"]
    L -->|"Matched"| N["Pending finance review"]
    M --> O["Finance resolves identity to employee or customer"]
    O --> N
    N --> P{"Finance decision"}
    P -->|"Reject"| Q["Rejected history"]
    P -->|"Approve"| R["Verified referral"]
    R --> S{"Client qualifies?"}
    S -->|"Not yet"| R
    S -->|"Yes"| T{"Referrer type"}
    T -->|"Customer"| U["Create invoice-discount reward"]
    T -->|"Employee"| V["Create referral payout in Payables"]
    U --> W["Apply discount to next eligible draft invoice"]
    V --> X["Finance pays through employee/payables process"]
```

## 7. People And Payables Process

```mermaid
flowchart TD
    A["Finance opens People"] --> B["Onboard employee"]
    B --> C["Assign employee ID and HR/compensation fields"]
    C --> D["Employee appears in employee DB"]
    D --> E["Referral Engine can match employee by ID/email/phone"]
    D --> F["Record employee payment"]
    F --> G["Employee 360 payment history"]
    G --> H["Payables employee spend by region"]
    I["Finance opens Payables"] --> J["Record Other entry"]
    J --> K{"Direction"}
    K -->|"Paid"| L["Operating expense by category and region"]
    K -->|"Received"| M["Income/refund entry tracked separately"]
    N["Qualified employee referral"] --> O["Referral payout ledger"]
    O --> H
```

## 8. AWS User Flow And Service Touchpoints

```mermaid
flowchart TD
    U["Finance user browser"] --> CF["CloudFront"]
    CF --> S3Web["S3 static web app"]
    U --> API["App Runner or ECS/EC2 Node API"]
    API --> PG["PostgreSQL"]
    API --> S3Contracts["Private S3 contracts bucket"]
    API --> SES["SES outbound email"]
    API --> Secrets["SSM Parameter Store / Secrets Manager"]
    API --> Logs["CloudWatch logs"]
    Scheduler["EventBridge Scheduler"] --> Worker["Lambda or container worker"]
    Worker --> Gmail["Gmail API"]
    Worker --> SQS["SQS work queue"]
    SQS --> Worker
    Worker --> PG
    Worker --> SES
    BackupJob["Cron / EventBridge backup job"] --> BackupS3["S3 backup bucket"]
    PG --> BackupJob
```

## 9. Diagram Legend

| Component | One-line function |
| --- | --- |
| Finance user browser | Operator-facing entry point for onboarding, billing, payment review, receipts, settings, and reporting. |
| CloudFront | Global HTTPS edge layer for serving the React application quickly and securely. |
| S3 static web app | Low-cost storage for the compiled frontend bundle. |
| Node API | Express backend that enforces auth, business rules, payment application, receipt actions, and portal APIs. |
| PostgreSQL | System of record for customers, contracts, invoices, payments, exceptions, referrals, settings, and audit history. |
| Referral Engine | Public no-login referral intake and finance-admin approval gate before reward routing. |
| People ledger | Employee master data, status, compensation context, and payment history. |
| Payables ledger | Employee payments, employee referral payouts, other expenses paid, and other income/refund entries. |
| Private S3 contracts bucket | Secure encrypted storage for uploaded contract files by owner category, owner ID, and date. |
| SES | AWS-native outbound invoice and receipt email delivery. |
| SSM Parameter Store / Secrets Manager | Secure runtime storage for passwords, Gmail tokens, SMTP/SES credentials, and API secrets. |
| CloudWatch logs | Centralized application, worker, sync, and error logs. |
| EventBridge Scheduler | Runs Gmail sync and backup schedules without relying on a user click. |
| Lambda or container worker | Executes background sync, reconciliation, email jobs, and future bank integration tasks. |
| Gmail API | Reads Zelle confirmation messages from the configured mailbox. |
| SQS work queue | Decouples background work from user-facing API requests. |
| S3 backup bucket | Stores database backup snapshots with lifecycle transition to low-cost archive storage. |

## 10. Risk Controls

| Risk | Control |
| --- | --- |
| Same Zelle email synced twice | `processed_messages` prevents duplicate Gmail message processing. |
| Same Zelle transaction number replayed | Confirmed Zelle references are unique across Gmail and manual Zelle scopes. |
| Payment posted to wrong customer | Exceptions require human review and customer assignment before apply. |
| Manual payment entered without proof | Manual form captures route, reference, memo, and internal verification note. |
| Referral bonus paid incorrectly | Every Referral Engine submission requires finance approval before reward routing; customer rewards are invoice discounts and employee rewards route to Payables. |
| Employee payment not visible to finance | Employee payments are stored in `employee_payments` and roll up in People 360 plus Payables region reporting. |
| Other expense loses context | Other entries store category, direction, vendor/source, region, department, memo, reference, recording user, and exact cents. |
| Lost cloud data | PostgreSQL backups should run every 2 hours into private S3 with lifecycle policy. |
