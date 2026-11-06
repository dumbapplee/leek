# Agent brief: Wave 05 of 9, Entry points

You are the agent responsible for **Wave 5** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-05-ENTRY-POINTS.pdf) explains the same wave for humans.

## Mission
Expose the two entry points that feed the pipeline: the dev message route for single events and the bulk import worker for CSV files.

Why it matters: Both entry points reuse one pipeline. This is what keeps the bulk path and the event path consistent.

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
- **Requires:** Wave 2, Wave 4
- **Unlocks:** Wave 6, Wave 7
- **Hand-off to next wave:** Wave 6 exposes the job status API and writes the focused tests against this behaviour.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('single-event-pipeline', 'input-validation', 'snapshot-index');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('dev-messages-endpoint', 'bulk-import-worker');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### dev-messages-endpoint: Exposing POST /_dev/messages
- **Depends on:** single-event-pipeline
- **What to do:** Expose POST /_dev/messages. It parses a SellerInventoryChanged body and calls the same consumer adapter and pipeline the real consumer uses, with no duplicated logic. Enable it when ENABLE_DEV_ROUTES=true or NODE_ENV is not production. Return the pipeline result as JSON.
- **Files:** `src/consumers/stockChangedHandler.ts`, `src/routes/devMessages.ts`
- **Acceptance:**
  - [ ] Posting `wiremock/__files/sample-event.json` returns APPLIED on the first call and SKIPPED_STALE on an identical replay.
  - [ ] The route is absent when dev routes are disabled.

### bulk-import-worker: Implementing bulk import worker
- **Depends on:** input-validation, single-event-pipeline, snapshot-index
- **What to do:** Implement POST /v1/availability/imports. It validates the CSV header, stores the job as QUEUED and returns 202 with a jobId. An in-process worker loads the snapshot once per country, reads rows in chunks of CHUNK_SIZE (default 500), runs each row through the pipeline with at most CONCURRENCY rows in flight (default 8), and writes one import_rows entry per row. Invalid rows become failed with a line number. Stale rows become skipped and never fail the upload. Final state is COMPLETED, or COMPLETED_WITH_ERRORS if any row failed. Jobs left RUNNING at startup are re-queued.
- **Files:** `src/imports/bulkImportWorker.ts`, `src/routes/imports.ts`
- **Acceptance:**
  - [ ] A stale row alone does not reject the upload.
  - [ ] The counters equal the number of import_rows entries when the job completes.
  - [ ] Duplicate keys in one file are processed in row order.

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
npm test
npm start   (then POST /_dev/messages with wiremock/__files/sample-event.json)
```

## Definition of Done

**Wave objective:** both entry points (the dev message route and the bulk import worker) feed the same pipeline, so the event path and the CSV path follow identical rules.

**Validation tests**

| Test | File | Proves |
|---|---|---|
| First call APPLIED | `test/devMessages.test.ts` | Posting `wiremock/__files/sample-event.json` returns APPLIED. |
| Replay SKIPPED_STALE | `test/devMessages.test.ts` | An identical replay returns SKIPPED_STALE. |
| Route disabled | `test/devMessages.test.ts` | POST /_dev/messages is absent when dev routes are off. |
| Stale row does not fail | `test/bulkImport.test.ts` | A stale row alone leaves the upload COMPLETED. |
| Counters match | `test/bulkImport.test.ts` | totalProcessed equals the number of import_rows entries when the job completes. |
| Row order | `test/bulkImport.test.ts` | Duplicate keys in one file are processed in row order. |
| Requeue on startup | `test/bulkImport.test.ts` | Jobs left RUNNING are re-queued at startup. |
| Bounded memory | `test/bulkImport.test.ts` | Rows are read in CHUNK_SIZE chunks; results are not accumulated in memory. |

**Checklist**
- [ ] `npm test` passes, including the new route and worker tests.
- [ ] `npm run typecheck` passes.
- [ ] The dev route and the worker both call the same pipeline function. Grep confirms no second implementation.
- [ ] CONCURRENCY and CHUNK_SIZE are read from `src/config.ts`.
- [ ] Manual check: `npm start`, then POST the sample event to /_dev/messages and get APPLIED.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('dev-messages-endpoint', 'bulk-import-worker');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- The worker processes the CSV in chunks of CHUNK_SIZE (default 500). It must not hold all results in memory.
- CONCURRENCY (default 8) protects WireMock and the gateway. Keep it configurable.
