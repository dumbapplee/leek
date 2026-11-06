# Agent brief: Wave 03 of 9, Adapters

You are the agent responsible for **Wave 3** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-03-ADAPTERS.pdf) explains the same wave for humans.

## Mission
Implement the four adapters that talk to the outside world or to SQLite. Each hides its transport details behind a small interface.

Why it matters: Wave 4 composes these adapters into the pipeline. Keeping the interfaces small is what makes the pipeline testable without WireMock.

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
- **Requires:** Wave 2
- **Unlocks:** Wave 4
- **Hand-off to next wave:** Wave 4 composes product-context-client, availability-client, version-store and outbox-publisher into one pipeline.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('retry-policy', 'sqlite-schema');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('product-context-client', 'version-store', 'outbox-publisher', 'availability-client');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### product-context-client: Implementing Product Context client
- **Depends on:** retry-policy
- **What to do:** Implement the client for GET /v1/products/{productId}/sizes/{sizeId}?countryCode=PT using the retry helper. Map 429 and 503 to retryable errors and 404 to a terminal NotFound. Return productStatus and countryEnabled so the pipeline can reject inactive products and disabled countries. Validate the response shape before returning it.
- **Files:** `src/clients/productContextClient.ts`
- **Acceptance:**
  - [ ] style-90001 (429 with Retry-After: 5) and style-90002 (503) are handled as retryable.
  - [ ] style-9999 (inactive) and style-9998 (countryEnabled false) map to domain rejections, not transport errors.
  - [ ] Unknown combinations (404) are terminal.

### version-store: Implementing version compare-and-set
- **Depends on:** sqlite-schema
- **What to do:** Implement the version compare-and-set on stock_versions. tryApply(key, sourceVersion) runs in one SQL transaction: insert the key if it is missing, then UPDATE ... WHERE applied_source_version < ?. One changed row means APPLIED; zero means STALE. Equal or lower versions never overwrite stock. Also expose read(key) for the re-check under the lease.
- **Files:** `src/stores/versionStore.ts`
- **Acceptance:**
  - [ ] A higher version is applied; an equal or lower version returns STALE.
  - [ ] Two calls with the same new version result in exactly one APPLIED.

### outbox-publisher: Implementing outbox publisher
- **Depends on:** retry-policy, sqlite-schema
- **What to do:** Provide enqueue(tx, event), which writes an outbox row inside the caller's transaction, and a background publisher that reads unpublished rows and POSTs them to /mock-broker/v1/events. Publishing is parallel, bounded by CONCURRENCY. Each event carries sourceVersion, so consumers ignore any event whose version is not higher than the last one they applied. A 202 response marks the row as published. Failures are retried with backoff and recorded in attempts and last_error. Event ids are deterministic (stock key plus sourceVersion), so replays are safe.
- **Files:** `src/outbox/outboxPublisher.ts`
- **Acceptance:**
  - [ ] published_at is set only after a 202 response.
  - [ ] fault-429 and fault-503 event ids trigger retry behaviour at the sink.
  - [ ] After a restart the publisher resumes unpublished rows.
  - [ ] The consumer contract documents that consumers order by sourceVersion.

### availability-client: Implementing Availability API client
- **Depends on:** retry-policy
- **What to do:** Implement PUT /v1/availability/{sellerId}/{productId}/{sizeId}?countryCode=PT with body availableQuantity, sourceVersion and the optional product context. The PUT is absolute, so retries are idempotent. Retry on 429 (honouring Retry-After), 503 and network errors. Map terminal 4xx responses to a rejection. Cover the seller-429 and seller-503 fault triggers.
- **Files:** `src/clients/availabilityClient.ts`
- **Acceptance:**
  - [ ] seller-503 is retried and ends in success or a retryable-exhausted failure.
  - [ ] The request body matches the contract in the assignment.

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
npm test -- clients version outbox
```

## Definition of Done

**Wave objective:** the three external-facing adapters work against a fake HTTP server: the Product Context client, the Availability client and the outbox publisher. The version compare-and-set is also in place, so the pipeline can rely on it.

**Validation tests** (no Docker; use a fake HTTP server)

| Test | File | Proves |
|---|---|---|
| 429 and 503 retried | `test/clients.test.ts` | style-90001 and style-90002 responses are retried, then succeed or fail as retryable. |
| Domain rejections | `test/clients.test.ts` | style-9999 and style-9998 map to REJECTED, not transport errors. |
| 404 terminal | `test/clients.test.ts` | Unknown combinations are not retried. |
| Seller 503 | `test/clients.test.ts` | seller-503 is retried, ending in success or retryable-exhausted. |
| PUT body contract | `test/clients.test.ts` | Request body and path match the assignment contract (absolute quantity, sourceVersion). |
| Higher version applied | `test/versionStore.test.ts` | A higher sourceVersion returns APPLIED. |
| Equal or lower stale | `test/versionStore.test.ts` | Equal or lower returns STALE. |
| Single winner | `test/versionStore.test.ts` | Two concurrent calls with the same new version yield exactly one APPLIED. |
| Ack after 202 | `test/outbox.test.ts` | published_at is set only after a 202 response. |
| Sink faults | `test/outbox.test.ts` | fault-429 and fault-503 event ids are retried. |
| Restart resumes | `test/outbox.test.ts` | Unpublished rows are sent after the publisher restarts. |

**Checklist**
- [ ] `npm test -- clients versionStore outbox` passes with no Docker running.
- [ ] `npm run typecheck` passes.
- [ ] Each client uses the retry helper from Wave 2. No second retry implementation exists.
- [ ] The consumer contract, stating that consumers order by sourceVersion, is written down (it is referenced by Wave 8).
- [ ] Waves 1 and 2 tests still pass.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('product-context-client', 'version-store', 'outbox-publisher', 'availability-client');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- The availability PUT is absolute. Never send a delta, or retries stop being idempotent.
- Parallel outbox publishing means consumers must order by sourceVersion. Document this in the consumer contract.
