# Agent brief: Wave 01 of 9, Foundation

You are the agent responsible for **Wave 1** of the Size-Level Availability Processor. This file contains everything you need. The companion PDF (WAVE-01-FOUNDATION.pdf) explains the same wave for humans.

## Mission
Create the runnable project skeleton: package manifest, strict TypeScript, configuration and a health endpoint.

Why it matters: Every later wave needs a compiling project with a config module and a server. Nothing can be tested until this exists.

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
- **Requires:** nothing (first wave)
- **Unlocks:** Wave 2
- **Hand-off to next wave:** Wave 2 receives the npm scripts (typecheck, build, test) and the `src/config.ts` contract.

## Before you start
1. Check that prerequisites are done in the session todos. If any is not done, stop and report it. Do not work around it.
No prerequisites. Wave 1 can start immediately.
2. Mark your tasks in progress:
```sql
UPDATE todos SET status = 'in_progress' WHERE id IN ('scaffold-project');
```
3. Read the files created by earlier waves before you change anything. Do not duplicate existing modules.

## Tasks
### scaffold-project: Scaffolding Node TypeScript project
- **Depends on:** nothing
- **What to do:** Create the Node.js and TypeScript project in the workspace root: package.json with scripts (dev, build, start, typecheck, test), a strict tsconfig.json, a config module that reads environment variables with defaults, and a minimal Express server exposing GET /health.
- **Files:** `package.json`, `tsconfig.json`, `src/config.ts`, `src/server.ts`, `src/main.ts`
- **Acceptance:**
  - [ ] npm install, npm run typecheck, npm run build and npm test all succeed (a health test is enough).
  - [ ] npm start serves GET /health with status 200.
  - [ ] Config defaults: COUNTRY_CODE=PT, PORT=3000, PRODUCT_CONTEXT_BASE_URL and AVAILABILITY_BASE_URL=http://127.0.0.1:8080, DB_PATH=./data/processor.db, CONCURRENCY=8, CHUNK_SIZE=500, RETRY_MAX_ATTEMPTS=5, RETRY_BASE_MS=200, RETRY_MAX_MS=5000, LEASE_TTL_MS=30000.

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
npm install
npm run typecheck
npm run build
npm test
npm start
curl http://127.0.0.1:3000/health
```

## Definition of Done

**Wave objective:** a compiling, runnable project skeleton with a validated config module and a health endpoint, so every later wave has a base to build on.

**Validation tests**

| Test | File | Proves |
|---|---|---|
| Health returns 200 | `test/health.test.ts` | The Express app serves GET /health. |
| Config defaults | `test/config.test.ts` | Every default in the acceptance list matches when no env vars are set. |
| Env override | `test/config.test.ts` | PORT and CONCURRENCY read from the environment and parsed as numbers. |

**Checklist**
- [ ] `npm install` completes, including the better-sqlite3 native build on Windows.
- [ ] `npm run typecheck`, `npm run build` and `npm test` pass with zero failures.
- [ ] `npm start` serves `curl http://127.0.0.1:3000/health` with status 200.
- [ ] No URL, port or secret is hard-coded outside `src/config.ts`.
- [ ] `tsconfig.json` has `"strict": true` and ESM output.
- [ ] Hand-off note lists the npm scripts and the `src/config.ts` contract for Wave 2.

## Done when
- Every acceptance box above is checked, and the verification commands pass.
- Mark your tasks done:
```sql
UPDATE todos SET status = 'done' WHERE id IN ('scaffold-project');
```
- Leave a short hand-off note in your final message: what the next wave can rely on, and anything you deviated from.

## Stop and ask when
- A fixture or WireMock mapping contradicts the shared context above.
- A contract needs to change that an earlier wave already relies on.
- You need a decision the plan does not cover.

## Risks and decisions for this wave
- The stack is fixed: Express, better-sqlite3 and Vitest. Changing it later means rework in waves 2 to 6.
- better-sqlite3 needs a native build on Windows. Install it in this wave so any problem shows up early.
