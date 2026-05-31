# Setu Finance Process Flow

This is the current business workflow for Setu Finance, written for operations and leadership teams.

## Quick Business View

```mermaid
flowchart TD
    A["Upload signed contract"] --> B["Parse client, services, fee, installments, and start date"]
    B --> C["Admin reviews and overrides anything needed"]
    C --> D["Create or update customer record"]
    D --> E["Store contract and key extracted fields"]
    E --> F["Generate draft invoices from the contract schedule"]
    F --> G["Send invoice"]
    G --> H["Capture payment from Zelle email or manual review"]
    H --> I{"Match confidence"}
    I -->|"Clear"| J["Payments to confirm"]
    I -->|"Unclear"| K["Exceptions"]
    K --> L["Finance resolves and assigns the right customer / action"]
    L --> J
    J --> M["Apply transaction"]
    M --> N["Completed transactions"]
    N --> O["Send or re-send PDF receipt"]
    O --> P["Update dashboard, customer 360, and history"]
```

### In Plain English

- First upload the signed contract.
- Let Setu prefill services, fee, installments, and dates.
- Adjust anything manually if the contract needs a finance override.
- Save the client and the generated draft invoices.
- Then send the invoice.
- When money shows up, save it as a transaction record.
- If the portal is confident, finance applies it from `Payments to confirm`.
- If the portal is not confident, finance resolves it in `Exceptions`.
- After apply, the transaction stays in history and the receipt can be sent separately.

## End-to-End Flow

```mermaid
flowchart LR
    A["1. Upload signed contract"] --> B["Read key contract fields"]
    B --> C["Prefill customer profile + short-name services"]
    C --> D["Admin overrides or adds missing data"]
    D --> E["Create stable customer ID and searchable profile"]
    E --> F["Store contract file and parsed contract summary"]
    F --> G["Generate draft invoice schedule"]
    G --> H["Send invoice email"]
    H --> I{"How does payment appear?"}
    I -->|"Zelle email synced"| J["Capture structured transaction details from inbox"]
    I -->|"Manual awareness"| K["Finance reviews payment details manually"]
    J --> L["Matching engine identifies customer and invoice"]
    K --> M["Save transaction record"]
    L -->|"Clear match"| N["Payments to confirm"]
    L -->|"Mismatch / ambiguity / duplicate"| O["Exceptions queue"]
    M --> N
    O --> P["Human resolves, reassigns, credits, or archives"]
    P --> N
    N --> Q["Human clicks Apply transaction"]
    Q --> R["Mark payment applied and update invoice / account state"]
    R --> S["Move record to Completed transactions"]
    S --> T["Send or re-send PDF receipt to primary customer email"]
    T --> U["Update dashboard, customer 360, activity history, and referral progress"]
```

## What This Means Operationally

- Contract upload is the first step. Finance should start from the signed agreement before invoicing begins.
- Parsed contract details should prefill the client record, services, billing cadence, fee, installments, and service-start date wherever possible.
- Admins can manually override contract-derived values before the record is saved.
- Every service enrollment is timestamped so later add-on services remain historically traceable.
- Contract binaries and extracted critical fields stay linked to the customer record and are visible in the full customer 360 page.
- Synced Zelle emails are converted into durable transaction records with captured details such as amount, transaction number, memo, dates, source emails, and raw extracted text.
- The system does not auto-post money blindly. A human still decides when to apply a prepared transaction.
- Applying a payment and sending a receipt are now separate actions.
- Completed transactions stay visible after apply so finance can send or re-send a receipt later if needed.
- Receipts are sent as PDF attachments to the customer’s primary email on file.
- Referral progress and rewards update only after a payment has actually been applied.

## Exception Paths

- If the payer identity is unclear, the transaction goes to `Exceptions`.
- If the amount does not match the expected invoice amount, the transaction goes to `Exceptions`.
- If the same payment appears twice, duplicate controls prevent it from being counted or applied twice.
- When finance resolves an exception, that decision stays in exception history with the resolution action, user, and timestamp.
- If no invoice exists yet, the payment can still be saved, reviewed, and linked later.
- If a client enrolls in more services later, onboarding adds new dated history instead of overwriting the original record.
