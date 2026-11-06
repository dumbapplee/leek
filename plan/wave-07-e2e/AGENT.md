# Agent brief: Wave 07 of 9, End-to-end

You are the agent responsible for **Wave 7** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-07-E2E.pdf) explains the same wave for humans.

## Mission
Run the full solution against the real mocks and record the evidence.

Why it matters: This is the first time the real WireMock mappings are used. Failures here usually reveal contract mismatches with the fixtures or the README.

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
- **Requires:** Wave 5, Wave 6
- **Unlocks:** Wave 8
- **Hand-off to next wave:** Wave 8 documents the behaviour that was verified here, not the behaviour that was intended.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
```sql
SELECT id, status FROM todos WHERE id IN ('dev-messages-endpoint', 'focused-tests', 'job-status-endpoint');
```
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('e2e-verification');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### e2e-verification: Verifying end-to-end against WireMock
- **Depends on:** dev-messages-endpoint, focused-tests, job-status-endpoint
- **What to do:** Run the solution against the real mocks: docker compose up -d, start the service, post sample-event.json through /_dev/messages and confirm the gateway and broker calls in WireMock's /__admin/requests. Then upload the 10,000-row CSV, poll the job until it finishes, and check the counts against the fixture. Exercise the fault inputs from the README. Record the results in docs/verification.md.
- **Files:** `scripts/e2e.ts`, `docs/verification.md`
- **Acceptance:**
  - [ ] The bulk job reaches COMPLETED or COMPLETED_WITH_ERRORS and its counts add up to 10,000 rows.
  - [ ] Each README fault input produces the documented behaviour.
  - [ ] docker compose down leaves no containers running.

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
docker compose up -d
npm start
curl -X POST http://127.0.0.1:3000/_dev/messages -H "Content-Type: application/json" --data @wiremock/__files/sample-event.json
curl http://127.0.0.1:8080/__admin/requests
docker compose down
```

## Definition of Done

**Wave objective:** the solution runs end to end against the real WireMock mocks, and the evidence is recorded in `docs/verification.md`. This wave tests the real fixtures and the README contract, not the fake servers from Wave 6.

**Validation runs**

| Check | How | Expected result |
|---|---|---|
| Single event | POST `wiremock/__files/sample-event.json` to /_dev/messages | APPLIED; `/__admin/requests` shows the PUT and the broker 202. |
| Replay | Same request again | SKIPPED_STALE. |
| Bulk file | Upload the 10,000-row CSV, poll until finished | COMPLETED or COMPLETED_WITH_ERRORS; applied + skipped + failed = 10,000. |
| style-90001 | Trigger the fault | 429, retried with Retry-After 5, then the documented outcome. |
| style-90002 | Trigger the fault | 503, retried, then the documented outcome. |
| seller-429 and seller-503 | Trigger on the availability PUT | Retried as documented. |
| style-9999 and style-9998 | Trigger the inactive and disabled cases | REJECTED with the reason. |
| Unknown combination | Unknown product | 404, terminal, not retried. |
| Shutdown | `docker compose down` | No containers left running. |

**Checklist**
- [ ] `scripts/e2e.ts` runs against the live WireMock and produces the evidence.
- [ ] `docs/verification.md` records the actual counts and status codes from this run, not expected values.
- [ ] Every row in the table above has a recorded result.
- [ ] Any mismatch with the fixtures or the README is raised under "Stop and ask", not patched in the mocks.
- [ ] `npm test` still passes after the e2e script is added.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('e2e-verification');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- Docker must be running before docker compose up -d.
- Fixture counts are read from the CSV, not assumed. Check that the 10,000 rows sum correctly.
