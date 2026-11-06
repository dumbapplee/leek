# Agent brief: Wave 06 of 9, API and tests

You are the agent responsible for **Wave 6** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-06-API-AND-TESTS.pdf) explains the same wave for humans.

## Mission
Complete the bulk contract with the job status endpoint and lock in the business rules with focused tests.

Why it matters: The tests fix the rules before the end-to-end run, so any later failure points to a contract mismatch and not to a rule that was never agreed.

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
- **Requires:** Wave 4, Wave 5
- **Unlocks:** Wave 7
- **Hand-off to next wave:** Wave 7 runs everything against the real WireMock mocks.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('bulk-import-worker', 'single-event-pipeline');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('job-status-endpoint', 'focused-tests');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### job-status-endpoint: Exposing job status endpoint
- **Depends on:** bulk-import-worker
- **What to do:** Expose GET /v1/availability/imports/{jobId}. It returns state, totalProcessed, succeeded, failed, skipped and a paginated list of row errors (lineNumber and reason) using limit and offset query parameters. An unknown jobId returns 404.
- **Files:** `src/routes/jobStatus.ts`
- **Acceptance:**
  - [ ] Counters come from import_jobs and agree with import_rows.
  - [ ] Errors are returned in a stable order by lineNumber.

### focused-tests: Writing focused tests
- **Depends on:** bulk-import-worker, single-event-pipeline
- **What to do:** Write unit and integration tests with injected clients and a small fake HTTP server, not WireMock. Cover: the version rule; stale rows in a bulk upload do not fail it; replay by eventId is idempotent; 404, inactive product and disabled country are terminal; 429 honours Retry-After; 503 retries and then fails; a publish failure after a successful gateway write is retried by the outbox and the event is not lost.
- **Files:** `test/pipeline.test.ts`, `test/bulk.test.ts`, `test/outbox.test.ts`, `test/clients.test.ts`
- **Acceptance:**
  - [ ] npm test passes without Docker.
  - [ ] Every fault input in the README has at least one test.

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
npm test
npm run typecheck
```

## Definition of Done

**Wave objective:** the job status API is complete, and the business rules are locked in by focused tests that run without Docker, so any later failure points to a contract mismatch.

**Validation tests**

| Test | File | Proves |
|---|---|---|
| Counters agree | `test/bulk.test.ts` | Job counters match the import_rows entries. |
| Unknown job | `test/bulk.test.ts` | GET /v1/availability/imports/{jobId} returns 404 for an unknown id. |
| Stable error order | `test/bulk.test.ts` | Row errors are sorted by lineNumber; limit and offset paginate correctly. |
| Version rule | `test/pipeline.test.ts` | Higher applies; equal or lower is skipped. |
| Stale in bulk | `test/bulk.test.ts` | Stale rows do not fail the upload. |
| Replay idempotent | `test/pipeline.test.ts` | Replaying an eventId does not change stock or publish twice. |
| Terminal rules | `test/clients.test.ts` | 404, inactive product and disabled country are terminal. |
| 429 Retry-After | `test/clients.test.ts` | Retry-After is honoured. |
| 503 exhausted | `test/clients.test.ts` | 503 retries, then fails. |
| Publish failure | `test/outbox.test.ts` | A publish failure after a successful gateway write is retried by the outbox; the event is not lost. |

**Checklist**
- [ ] `npm test` passes without Docker.
- [ ] `npm run typecheck` passes.
- [ ] Every fault input in the README has at least one test. Tick each: style-90001, style-90002, seller-429, seller-503, style-9999, style-9998, unknown 404.
- [ ] Tests use injected clients and a fake HTTP server, not WireMock.
- [ ] Waves 1 to 5 tests still pass.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('job-status-endpoint', 'focused-tests');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- Tests must not depend on Docker. Use injected clients and a small fake HTTP server.
- Retry tests use an injected sleep so they stay fast.
