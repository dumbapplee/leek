# Agent brief: Wave 04 of 9, Core pipeline

You are the agent responsible for **Wave 4** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-04-PIPELINE.pdf) explains the same wave for humans.

## Mission
Build the snapshot index and the single processing pipeline that both events and CSV rows use.

Why it matters: The pipeline is the core business rule. It is the only place where validation, the version rule, enrichment, the gateway write and the outbox commit meet.

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
- **Requires:** Wave 2, Wave 3
- **Unlocks:** Wave 5, Wave 6
- **Hand-off to next wave:** Wave 5 wires the pipeline into the dev endpoint and into the bulk worker. Both must call the same function.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('product-context-client', 'availability-client', 'input-validation', 'outbox-publisher', 'version-store');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('snapshot-index', 'single-event-pipeline');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### snapshot-index: Implementing snapshot fetch and index
- **Depends on:** product-context-client
- **What to do:** Fetch GET /v1/product-contexts/snapshot?countryCode=PT once per country and build an in-memory Map keyed by productId|sizeId|countryCode (about 50,000 entries). Concurrent callers share the same in-flight promise. Lookups are O(1). The index is never rebuilt per row.
- **Files:** `src/index/snapshotIndex.ts`
- **Acceptance:**
  - [ ] The snapshot is requested exactly once per country, even under concurrent calls (checked with a request counter in a test).
  - [ ] A key missing from the snapshot is a terminal not-found result.

### single-event-pipeline: Composing shared processing pipeline
- **Depends on:** availability-client, input-validation, outbox-publisher, product-context-client, version-store
- **What to do:** Compose the single flow used by events and CSV rows. Steps: validate; quick version check (stale becomes SKIPPED_STALE); enrich from the snapshot index or the client (missing, inactive or disabled becomes REJECTED); acquire the per-stock-key lease in stock_leases; re-check the version; PUT to the gateway; then, in one transaction, commit the version and enqueue the outbox event; release the lease in a finally block. A failure after the PUT is safe to retry because the PUT is absolute.
- **Files:** `src/pipeline/processStockChange.ts`, `src/pipeline/keyLease.ts`
- **Acceptance:**
  - [ ] The result is one of APPLIED, SKIPPED_STALE, REJECTED (with reason) or FAILED_RETRYABLE (with reason).
  - [ ] Two changes for the same key run one at a time. The lease is per key and stored in the database, so it works across processes that share the database file.
  - [ ] An expired lease left by a crashed process is taken over after LEASE_TTL_MS.
  - [ ] The gateway write happens before the version commit.

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
npm test -- pipeline snapshot
```

## Definition of Done

**Wave objective:** one processing pipeline that applies a stock change safely: it validates, rejects stale versions, enriches from the snapshot, serialises per stock key, writes to the gateway, then commits the version and the outbox row together.

**Validation tests**

| Test | File | Proves |
|---|---|---|
| Snapshot fetched once | `test/snapshot.test.ts` | Concurrent calls for one country trigger exactly one request (request counter). |
| Missing key | `test/snapshot.test.ts` | A key absent from the snapshot returns NOT_FOUND. |
| Four result types | `test/pipeline.test.ts` | Each path returns APPLIED, SKIPPED_STALE, REJECTED (with reason) or FAILED_RETRYABLE (with reason). |
| Same-key serialisation | `test/pipeline.test.ts` | Two changes for one key run one at a time, using the database lease. |
| Lease takeover | `test/pipeline.test.ts` | An expired lease is taken over after LEASE_TTL_MS (fake clock). |
| Gateway before commit | `test/pipeline.test.ts` | A spy confirms the PUT completes before the version and outbox commit. |

**Checklist**
- [ ] `npm test -- pipeline snapshot` passes.
- [ ] `npm run typecheck` passes.
- [ ] Snapshot lookups are O(1) Map reads; the index is never rebuilt per row.
- [ ] LEASE_TTL_MS is compared with the longest gateway call including retries, and the result is recorded in `docs/decisions.md`.
- [ ] Waves 1 to 3 tests still pass.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('snapshot-index', 'single-event-pipeline');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- Order matters: gateway write first, then the version commit together with the outbox row.
- The lease TTL (LEASE_TTL_MS, default 30000) must exceed the longest gateway call including retries. Record this in docs/decisions.md.
