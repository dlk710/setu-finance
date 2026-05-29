# Setu Backend Architecture

## Current layers

1. `src/`
   React frontend and the local operator UI.
2. `server/index.js`
   Thin HTTP API surface and auth middleware.
3. `server/stateStore.js`
   The application write/read model layer for portal operations.
4. `server/services/`
   External integration logic:
   - SMTP mail
   - Gmail auth and inbox parsing
   - payment matching
5. `server/db/`
   Database runtime:
   - connection pooling
   - migrations
   - seeding/bootstrap
   - normalization helpers
6. PostgreSQL
   Source of truth for operational state.

## Core schema domains

- `customers`
- `customer_services`
- `customer_emails`
- `customer_phones`
- `customer_aliases`
- `invoices`
- `payments`
- `exceptions`
- `exception_candidates`
- `activity_events`
- `processed_messages`
- `integration_states`
- `app_sequences`
- `dashboard_snapshots`
- `dashboard_aging_buckets`
- `dashboard_collection_series`

## Why this shape

- Customers, contacts, aliases, and invoices are normalized because they will be reused across future modules.
- Payments and exceptions are modeled as operational queues instead of frontend-only arrays.
- Dashboard data is stored as projection tables so analytics can later move to dedicated pipelines without rewriting the UI contract immediately.
- Integration metadata stays in JSONB because it is low-volume, sparse, and not latency-critical.

## Performance choices

- Indexed match paths:
  - normalized customer name
  - normalized alias name
  - normalized email
  - phone last 4
  - invoice status + due date
  - payment review status
  - exception status
- Connection pooling is configurable through `.env`.
- Request handlers stay thin; data shaping happens in the store layer so future endpoints can reuse the same transactional operations.

## Product-suite growth path

To evolve this beyond the current portal, the recommended sequence is:

1. Add `organizations`, `workspaces`, and tenant scoping to all operational tables.
2. Split `stateStore.js` into module-specific repositories and services as the API surface grows.
3. Introduce an outbox / job runner for email delivery and inbox sync.
4. Add search endpoints backed by indexed SQL instead of client-only search.
5. Move dashboard metrics to scheduled projections or a warehouse if analytics volume increases.

## Current tradeoffs

- The app still assembles a portal-wide read model for the existing UI, which is fine at current scale but should be narrowed into endpoint-specific queries as the product suite expands.
- Email sending remains request-coupled for now. That keeps behavior simple locally, but a job queue is the right next step for high-volume use.

## AWS target

The recommended first production deployment is intentionally different from the local stack while preserving the same behavior:

- static frontend on S3 + CloudFront
- Node/Express API on App Runner
- PostgreSQL on RDS
- background work through SQS + Lambda
- scheduled Gmail sync through EventBridge Scheduler
- outbound email through SES

The full diagram and cost rationale are in [aws-solution-architecture.md](/Users/lohithdeshpande/Documents/Claude/Projects/FinanceProduct/docs/aws-solution-architecture.md).
