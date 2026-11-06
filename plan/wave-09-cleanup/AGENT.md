# Agent brief: Wave 09 of 9, Cleanup

You are the agent responsible for **Wave 9** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-09-CLEANUP.pdf) explains the same wave for humans.

## Mission
Remove everything that is not a deliverable, leaving source, tests, configuration, docs/ and the plan folder.

Why it matters: This is the final hygiene step. The repository should contain only what a reviewer needs to run and read the solution.

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
- **Requires:** Wave 8
- **Unlocks:** nothing (last wave)
- **Hand-off to next wave:** End of plan. The solution is ready for review.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('readme-docs');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('cleanup-temp');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### cleanup-temp: Cleaning up temporary files
- **Depends on:** readme-docs
- **What to do:** Remove artefacts that are not deliverables: data/*.db files created during testing, dist/, coverage/ and scratch files. Keep the fixtures in wiremock/__files, the assignment PDF, docs/ and the plan folder. Confirm .gitignore covers build and data output, then review git status.
- **Files:** `.gitignore`
- **Acceptance:**
  - [ ] git status shows only source, tests, configuration, docs/ and the plan folder.
  - [ ] npm run build and npm test still pass after cleanup.

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
git status
```

## Definition of Done

**Wave objective:** the repository contains only what a reviewer needs to run and read the solution.

**Validation checks**

| Check | How | Expected result |
|---|---|---|
| Clean tree | `git status` | Only source, tests, configuration, `docs/`, `plan/` and the fixtures appear. |
| Ignored output | Inspect `.gitignore` | `dist/`, `coverage/` and `data/*.db` are ignored. |
| Still builds | `npm run build` | Passes after cleanup. |
| Still tests | `npm test` | Passes after cleanup. |
| Fixtures kept | Check `wiremock/__files` and the assignment PDF | Both still present and unchanged. |

**Checklist**
- [ ] No scratch files, `dist/`, `coverage/` or test databases are left behind.
- [ ] `.gitignore` covers build and data output.
- [ ] `wiremock/__files`, `wiremock/mappings`, `compose.yaml`, the mock guide and the assignment PDF are unchanged.
- [ ] `plan/` is kept.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('cleanup-temp');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- Do not delete the fixtures in wiremock/__files or the assignment PDF.
- Keep the plan folder.
