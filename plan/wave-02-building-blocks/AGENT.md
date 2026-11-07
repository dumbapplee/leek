# Agent brief: Wave 02 of 9, Building blocks

You are the agent responsible for **Wave 2** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-02-BUILDING-BLOCKS.pdf) explains the same wave for humans.

## Mission
Build the three independent pieces every client and the pipeline depend on: validation, retry policy and the SQLite schema.

Why it matters: These three have no dependency on each other, so they can be built in parallel. They are pure logic or storage with no network calls.

## Shared context (read first)
- Event SellerInventoryChanged carries eventId, eventType, schemaVersion, occurredAt, sellerId, productId, sizeId, countryCode, availableQuantity and sourceVersion.
- Product Context: `GET /v1/products/{productId}/sizes/{sizeId}?countryCode=PT`. The lookup key is (productId, sizeId, countryCode). Sellers are not part of it.
- Availability: `PUT /v1/availability/{sellerId}/{productId}/{sizeId}?countryCode=PT` with body availableQuantity, sourceVersion and optional product context. The PUT is absolute, never a delta.
- Event sink: `POST /mock-broker/v1/events` returns 202 for normal events. Fault inputs use eventId values fault-429 and fault-503.
- Snapshot: `GET /v1/product-contexts/snapshot?countryCode=PT` returns about 50,000 objects. Fetch it once per country, never per row.
- Bulk CSV header: `sellerId,productId,sizeId,countryCode,availableQuantity,sourceVersion`. The fixture has 10,000 data rows.
- Versioning: sourceVersion is monotonic per (sellerId, productId, sizeId, countryCode). Equal or lower versions are stale: they never overwrite stock or publish, and a stale row never rejects the whole upload. Inventory events and CSV rows share one version sequence per stock key.
- WireMock runs with `docker compose up -d` on http://127.0.0.1:8080. Admin requests are at `/__admin/requests`.
- Fault inputs (README): style-90001 gives 429 with Retry-After: 5; style-90002 gives 503; seller-429 and seller-503 hit the availability PUT; style-9999 is inactive; style-9998 has countryEnabled false; unknown combinations return 404.

## Fixed decisions
- Stack: Node.js + TypeScript (strict, ESM), Express, better-sqlite3, Vitest.
- Per-key serialisation: A lease row in stock_leases inside the database. Not an in-memory lock.
- Lease TTL: LEASE_TTL_MS=30000. An expired lease is taken over.
- Bulk processing: CONCURRENCY=8 and CHUNK_SIZE=500, both configurable.
- Retries: RETRY_MAX_ATTEMPTS=5, RETRY_BASE_MS=200, RETRY_MAX_MS=5000. Exponential backoff with full jitter. Engineering defaults, not from the assignment.
- Outbox publishing: Parallel, bounded by CONCURRENCY. Consumers order by sourceVersion.
- Documentation: root README.md is the solution README. Details in docs/: solution.md, decisions.md, verification.md. The assignment guide is renamed MOCK-ENVIRONMENT.md and is not modified.
- Production broker (documented): Kafka, partitioned by stock key.

## Where you fit
- **Requires:** Wave 1
- **Unlocks:** Wave 3, Wave 4, Wave 5
- **Hand-off to next wave:** Wave 3 uses the retry helper in both HTTP clients, the database opener, the version and outbox tables and the lease table.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('scaffold-project');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('input-validation', 'retry-policy', 'sqlite-schema');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### input-validation: Implementing input validation
- **Depends on:** scaffold-project
- **What to do:** Implement pure validation functions with no I/O. validateSellerInventoryChanged checks required fields, countryCode as ISO 3166-1 alpha-2 (two uppercase letters, assigned codes only; see the assignment), availableQuantity as an integer of at least 0 and sourceVersion as an integer. validateCsvHeader enforces the exact header order. validateCsvRow returns errors with the line number. Functions return result objects and never throw.
- **Files:** `src/domain/validation.ts`, `test/validation.test.ts`
- **Acceptance:**
  - [ ] Field-level errors include the field name and a reason.
  - [ ] A header mismatch is rejected before any row is processed.
  - [ ] The eventType and schemaVersion values match `wiremock/__files/sample-event.json`.

### retry-policy: Implementing retry policy
- **Depends on:** scaffold-project
- **What to do:** Create a generic retry helper with exponential backoff and full jitter. Max attempts, base delay and max delay come from config (RETRY_MAX_ATTEMPTS, RETRY_BASE_MS, RETRY_MAX_MS). Classify errors as retryable (429, 503, network errors and timeouts) or terminal (404, other 4xx and domain rejections). For 429 honour the Retry-After header in seconds and wait at least that long. Make the sleep function injectable. The numeric defaults are engineering choices, not values from the assignment, and must be justified in docs/decisions.md.
- **Files:** `src/infra/retry.ts`, `test/retry.test.ts`
- **Acceptance:**
  - [ ] Retry-After: 5 produces a delay of at least 5 seconds, verified with an injected clock.
  - [ ] Terminal errors are never retried.
  - [ ] After the maximum attempts the last error is returned as a failure result, not thrown.

### sqlite-schema: Creating SQLite schema and leases
- **Depends on:** scaffold-project
- **What to do:** Create the schema and a database opener. Enable WAL mode and foreign keys. Tables: stock_versions (composite key seller_id, product_id, size_id, country_code, plus applied_source_version), import_jobs (job_id, state, counters, timestamps), import_rows (job_id, line_number, outcome, reason), outbox (autoincrement id, unique event_id, stock_key, payload_json, published_at, attempts, last_error) and stock_leases (stock_key primary key, owner, expires_at_ms) for the per-key lease. Migrations are idempotent and run at startup.
- **Files:** `src/infra/schema.sql`, `src/infra/db.ts`
- **Acceptance:**
  - [ ] The schema applies twice without error.
  - [ ] The outbox has an index on (published_at, id) for the publisher scan.
  - [ ] stock_leases has stock_key as its primary key.
  - [ ] A test opens an in-memory database and inserts one row in each table.

## Conventions
- TypeScript strict mode, ESM modules, camelCase file names as listed above.
- Only comment code that needs a bit of clarification. Do not add other comments.
- Keep changes surgical. Do not refactor modules outside this wave.
- Read configuration only through `src/config.ts`. Never hard-code URLs or commit secrets.
- Do not modify `wiremock/__files`, `wiremock/mappings`, `compose.yaml` or `MOCK-ENVIRONMENT.md`.
- Write files with the file tools, not with shell redirection.
- Use the same HTTP client, retry helper and database opener from earlier waves. Do not create parallel versions.

## Verification (run before you finish)
```powershell
npm run typecheck
npm test -- validation retry db
```

## Definition of Done

**Wave objective:** validation, retry policy and the SQLite schema exist as pure, tested building blocks, so Wave 3 can use them without changes.

**Validation tests**

| Test | File | Proves |
|---|---|---|
| Valid event accepted | `test/validation.test.ts` | A sample event passes with no errors. |
| Field errors | `test/validation.test.ts` | Missing field, lowercase countryCode, negative or fractional quantity each return the field name and a reason. |
| Header mismatch | `test/validation.test.ts` | A CSV header in the wrong order is rejected before any row. |
| Line numbers | `test/validation.test.ts` | A bad CSV row reports its line number. |
| Retry-After honoured | `test/retry.test.ts` | Retry-After: 5 waits at least 5000 ms, with an injected clock. |
| Terminal not retried | `test/retry.test.ts` | 404 and domain rejections are called exactly once. |
| Max attempts | `test/retry.test.ts` | After RETRY_MAX_ATTEMPTS the last error returns as a failure result, not a throw. |
| Schema applies twice | `test/db.test.ts` | Migration is idempotent. |
| Index and keys | `test/db.test.ts` | Outbox index on (published_at, id) exists; stock_leases.stock_key is the primary key. |
| Row per table | `test/db.test.ts` | An in-memory database accepts one insert into each table. |

**Checklist**
- [ ] `npm run typecheck` passes.
- [ ] `npm test -- validation retry db` passes.
- [ ] Retry defaults are justified in `docs/decisions.md` as engineering choices.
- [ ] Table and column names match the contract in the acceptance list, since Wave 3 depends on them.
- [ ] Wave 1 tests still pass.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('input-validation', 'retry-policy', 'sqlite-schema');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- Retry-After handling is easy to get wrong. Test it with an injected clock, not real sleeps.
- Schema changes after wave 3 force migrations. Get the outbox, version and lease tables right now.
