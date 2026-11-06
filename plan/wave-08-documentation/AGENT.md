# Agent brief: Wave 08 of 9, Documentation

You are the agent responsible for **Wave 8** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-08-DOCUMENTATION.pdf) explains the same wave for humans.

## Mission
Write the solution documentation in docs/: how to run it, assumptions, decisions and complexity.

Why it matters: Documentation comes after the end-to-end run so that it describes verified behaviour and not the plan.

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
- **Requires:** Wave 7
- **Unlocks:** Wave 9
- **Hand-off to next wave:** Wave 9 removes temporary artefacts once the documentation is complete.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('e2e-verification');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('readme-docs');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### readme-docs: Writing solution docs
- **Depends on:** e2e-verification
- **What to do:** Write two files in docs/. docs/solution.md covers how to run and test the solution and the verified results from wave 7. docs/decisions.md covers assumptions, retry and idempotency decisions, the per-key lease, partial failure handling, concurrency control, the production broker (Kafka, partitioned by stock key) and the time and space complexity of the matching. Also write the root README.md as the submission README: a short overview that links to docs/. The assignment guide is now MOCK-ENVIRONMENT.md.
- **Files:** `README.md`, `docs/solution.md`, `docs/decisions.md`
- **Acceptance:**
  - [ ] Every claim matches the implemented code and the wave 7 evidence.
  - [ ] Complexity is stated as: index build O(N) per country with N = 50,000; row match O(1) on average; bulk processing O(M) with M = 10,000.

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
npm run build
npm test
```

## Definition of Done

**Wave objective:** a reviewer can run, test and understand the solution from `docs/` alone, and every claim matches the code and the verified results from Wave 7.

**Validation checks**

| Check | How | Expected result |
|---|---|---|
| Run instructions | Follow `docs/solution.md` on a clean clone | The service starts and the e2e steps work. |
| Claims match code | Read each claim in `docs/decisions.md` against the source | No claim describes behaviour the code does not have. |
| Evidence matches | Compare numbers with `docs/verification.md` | Counts and status codes are identical. |
| Complexity | Compare with the acceptance list | Index build O(N), N = 50,000 per country; row match O(1) average; bulk O(M), M = 10,000. |
| Build and tests | `npm run build` and `npm test` | Both pass. |

**Checklist**
- [ ] `docs/solution.md`, `docs/decisions.md` and `docs/verification.md` exist.
- [ ] Decisions cover: assumptions, retry and idempotency, per-key lease, partial failure, concurrency control, Kafka partitioned by stock key, complexity.
- [ ] Retry values are described as engineering choices, not assignment requirements.
- [ ] Root `README.md` exists and links to `docs/`. `MOCK-ENVIRONMENT.md` (the renamed assignment guide) is unchanged.
- [ ] The consumer ordering rule (order by sourceVersion) is documented.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('readme-docs');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- The mock environment guide is MOCK-ENVIRONMENT.md. The root README.md is the solution README.
- Every claim must match the implemented code and the wave 7 evidence.
