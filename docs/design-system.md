# Setu Design System

## Visual direction

The current product uses a calm internal-operations look rather than a generic dashboard style:

- warm paper backgrounds instead of flat white
- amber as the primary accent
- dense but readable information cards
- restrained typography with mono accents for money, counts, and references
- subtle gradients and blurred surfaces on auth and presentation layers

## Core tokens

The main UI tokens live in [src/styles.css](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/src/styles.css).

Primary tokens:

- `--ink`, `--ink-deep`
- `--amber`, `--amber-soft`, `--amber-deep`
- `--paper`, `--paper-2`, `--paper-3`, `--paper-cream`
- `--text-1`, `--text-2`, `--text-3`
- `--border-1`, `--border-2`
- `--success-text`, `--success-bg`
- `--warn-bg`, `--warn-text`

Typography:

- body: `Sohne` / `Manrope` fallback stack
- code and numeric accents: `IBM Plex Mono`
- editorial/legacy support: `Charter`

## Layout patterns

### Auth

- Full-page split composition
- Left side explains product value and access gating
- Right side is a compact task card for credentials

### Main app

- Sticky left sidebar for finance navigation
- Sticky topbar for local context and actions
- Metric cards across the top of major views
- Sectioned operational tables in the console

### Modals

- Used for invoice preview, exception resolution, and manual invoice creation
- Modal content is short, task-specific, and meant for a fast admin decision

## Key interaction patterns

### Honest integration state

The UI deliberately shows actual readiness:

- `Email ready` vs `Email not configured`
- `Gmail authorized` vs `Gmail needs auth` vs `Gmail not configured`

This is important for operator trust in an internal finance surface.

### Search-first customer selection

The manual invoice flow now uses:

- identity search instead of a large dropdown
- member-aware service options
- inline fallback to create a new customer

### Queue-based operations

The billing console is organized around operational queues:

- invoices due to send
- payments to confirm
- exceptions to resolve

That structure should remain stable as the product suite grows.

## Guidance for future screens

If new modules are added, they should preserve:

- the same warm paper palette
- the same mono treatment for financial values and references
- slim top-level navigation, not sprawling side trees
- operator-first workflows that surface exceptions instead of forcing manual hunting

## Design artifacts in this repo

- current wireframes: [files/phase1_prototype.html](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/files/phase1_prototype.html)
- current-state requirements: [files/setu_phase1_requirements.html](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/files/setu_phase1_requirements.html)
- live styles: [src/styles.css](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/src/styles.css)
