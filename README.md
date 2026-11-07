<p align="center">
  <img src="Farfetchd.webp" alt="Farfetch'd" width="240">
</p>

# Size-Level Availability Processor

Node.js, TypeScript (strict, ESM), Express, better-sqlite3, Vitest. Accepts seller inventory changes and bulk CSV uploads, enriches them with product context, writes availability to the gateway and publishes `SizeAvailabilityUpdated` events.

**Status:** typecheck, unit and route tests (329) and build pass. The end-to-end run against the Docker mocks passed on Windows after the dead-letter change. See [docs/verification.md](docs/verification.md).

## Run

Prerequisites: Node.js 20+ and Docker (for the mocks only).

```
npm install
docker compose up -d
npm run typecheck
npm test
npm run build
npm start
```

The service listens on `PORT` (default 3000). Mock routes, failure triggers and reset/stop commands are in `MOCK-ENVIRONMENT.md`. Stop the mocks with `docker compose down`.

Health check: `GET /health`.

| Method and path | Purpose |
|---|---|
| `POST /_dev/messages` | Single seller inventory change (JSON). Dev route. Enabled unless `NODE_ENV=production`; set `ENABLE_DEV_ROUTES=true` to enable it in production. |
| `POST /v1/availability/imports` | Bulk CSV upload (`text/csv`). Returns 202 with `jobId` and `statusUrl`. |
| `GET /v1/availability/imports/:jobId?limit=&offset=` | Job state, row counts and row-level errors. `limit` defaults to 100, max 1000. |

Configuration is read only in [src/config.ts](src/config.ts). Keys: `PORT`, `PRODUCT_CONTEXT_BASE_URL`, `AVAILABILITY_BASE_URL`, `EVENT_SINK_BASE_URL`, `DB_PATH` (default `./data/processor.db`), `CONCURRENCY`, `CHUNK_SIZE`, `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_MS`, `RETRY_MAX_MS`, `OUTBOX_MAX_ATTEMPTS` (default 10), `LEASE_TTL_MS`, `HTTP_TIMEOUT_MS` (default 5000), `ENABLE_DEV_ROUTES`.

Delete `data/*.db` before the first run after a schema change. The schema uses `CREATE TABLE IF NOT EXISTS` and has no migrations.

## Assumptions

- `countryCode` is an ISO 3166-1 alpha-2 code (for example `PT`). Validation checks the format against the ISO list in `src/domain/countryCodes.ts`.
- Delivery is at-least-once and may be out of order. `sourceVersion` decides: a change applies only if its version is greater than the last applied version for `(sellerId, productId, sizeId, countryCode)`.
- `eventId` identifies a delivery and may change on replay. It is not used for deduplication.
- Unknown product, inactive product, or product not enabled in the country are rejected with a reason. Nothing is written to the gateway or published for them.
- Stale or duplicate rows in a bulk upload are reported as **skipped**, not failed. They do not reject the upload.

## Design

- **Single change flow** (`processStockChange`): version check, context lookup, rejection rules, per-key lease, gateway PUT, then one DB transaction that records the version and enqueues the outbox event.
- **Bulk flow**: the upload is validated, stored as a job, and processed in the background. Rows are chunked (`CHUNK_SIZE`). Rows for the same stock key run in order. Different keys run in parallel up to `CONCURRENCY`.
- **Context matching**: the worker fetches the country snapshot once per job and indexes it by `(productId, sizeId, countryCode)`. Missing products are `not_found` for that row.
- **Outbox**: events are written in the same transaction as the version. A publisher posts pending rows to the event sink every second. Rows for one stock key publish in order; a failed row backs off (doubling from `RETRY_BASE_MS`, capped at `RETRY_MAX_MS`) and holds the rows behind it. After `OUTBOX_MAX_ATTEMPTS` failures the row is dead-lettered and stops holding its key.

Details and alternatives are in [docs/solution.md](docs/solution.md) and [docs/decisions.md](docs/decisions.md).

## Retry and idempotency

- Retries (`withRetry`) cover 429, 502, 503, 504 and network errors. 500 and other 4xx/5xx are terminal. Retry-After is honoured on 429. See [docs/decisions.md](docs/decisions.md).
- Gateway writes are idempotent for a version: re-sending the same version writes the same quantity. If the gateway succeeds and the DB commit fails, the next attempt re-sends the same version.
- The version is advanced only after a successful gateway PUT, so a failed row can be retried safely.
- The outbox event id is deterministic: `<stockKey>|v<sourceVersion>`. Consumers can deduplicate on it.
- A key lease (`LEASE_TTL_MS`, default 30 s) serialises writes for one stock key across concurrent requests and jobs. The holder renews it while it works. If the lease is lost, the row fails as retryable and nothing is committed.

## Partial failures

- A bulk job ends as `COMPLETED` (no failed rows) or `COMPLETED_WITH_ERRORS` (one or more failed rows).
- The status response reports `totalRows`, `processedRows`, `succeededRows`, `failedRows`, `skippedRows`, and `errors` for FAILED rows only: `{ line, reason }`, where line 1 is the header.
- Skipped (stale) rows are counted in `skippedRows` and do not appear in `errors`.
- Other rows continue after a row fails.

## Production broker

The production choice is **Kafka**, one topic for `SizeAvailabilityUpdated`, keyed by the stock key so that events for one key stay in order on one partition. Producers use idempotent sends. The local outbox table is the bridge: the transaction that advances the version also writes the event, and a publisher relays it to the broker. Consumers deduplicate on `eventId`. The local HTTP sink (`EVENT_SINK_BASE_URL`) is a test substitute for the broker.

## Complexity of bulk context matching

Let N be the number of context objects for the country and M the number of upload rows.

- **Time:** building the snapshot index is O(N). Each row lookup is O(1) on average (hash map). Matching all rows is O(N + M).
- **Space:** the index holds one entry per context, O(N), for the duration of one job. Each country snapshot is built separately per job.
- **Growth:** with 50,000 contexts and 10,000 rows (the provided fixtures), memory is dominated by the snapshot. Doubling N doubles the index. Doubling M doubles the lookups and the gateway calls, which dominate run time.
- **Not measured:** no timing run has been done.

## Known limits

- Each HTTP call to the gateway, product context service and event sink times out after `HTTP_TIMEOUT_MS`. A timeout is retryable.
- A lease holder that stalls past its TTL can leave the gateway behind the DB. Its in-flight PUT can land after a newer version was applied, and the gateway has no fencing token to reject it. The retry is then `SKIPPED_STALE`, so the newer value is not re-sent. The DB and outbox stay correct; the gateway keeps the older quantity until the next change for that key.
- The CSV parser handles RFC 4180 quoting within one line. A quoted field that contains a line break is not supported: that line is rejected as malformed.
- On restart, `RUNNING` jobs resume after their last recorded line. A row whose version was committed but whose row record was not written before a crash comes back as skipped (stale). The data is correct; only that line's entry in the job report is wrong.
- Outbox publishing is at-least-once and keeps per-key order. A row that keeps failing blocks the rows behind it for its key until it reaches `OUTBOX_MAX_ATTEMPTS`, with backoff capped at `RETRY_MAX_MS`. A dead-lettered row is not replayed by the processor; its key then continues, so that one event is lost from order.
- The local sink's fault-injection IDs (`fault-429`, `fault-503`) are not produced by the deterministic event id, so sink fault triggers do not apply to this service. The 429 and 503 sink paths are covered by unit tests against a fake sink.

## Agent team

The project was built by a team of five AI agents (supervisor, product owner, software engineer, QA engineer and manager) working in nine waves. Each task goes through requirements, tests first, implementation, verification and QA review. The agents pass work to each other through files in `work/`. See [AGENT-TEAM.pdf](AGENT-TEAM.pdf) for the roles, the task cycle and the wave plan.
