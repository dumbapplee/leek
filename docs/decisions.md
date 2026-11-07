# Decisions

## Retry defaults

`RETRY_MAX_ATTEMPTS=5`, `RETRY_BASE_MS=200` and `RETRY_MAX_MS=5000` are engineering choices, not values from the assignment. They are set in `src/config.ts` and can be overridden by environment variables.

- **Attempts (5).** Total calls, including the first. Five calls ride out a short outage of the Product Context or availability service without holding a row for long. Without Retry-After the waits are at most 200, 400, 800 and 1600 ms, so one row spends at most about 3 s waiting.
- **Base (200 ms).** The first retry ceiling. Short enough that a single transient fault costs little time, long enough not to hit a service that has just failed.
- **Cap (5000 ms).** Bounds any single jittered wait if `RETRY_MAX_ATTEMPTS` is raised. With the default of 5 attempts the cap is never reached.
- **Full jitter.** Each wait is random between 0 and the ceiling. Workers that fail together do not retry together.
- **Retry-After is not capped.** A 429 floor is the server's stated wait, so `RETRY_MAX_MS` does not shorten it.

## Error classification

The classification reads the error fields that the HTTP clients set (`status`, `retryAfter`, `cause.code`, `name`).

- **A numeric `status` decides.** 429, 502, 503 and 504 are retryable. Every other status is terminal, even when the error also carries a network code or a timeout name.
- **Without a status,** the error is retryable if `cause.code` is ECONNRESET, ECONNREFUSED, ETIMEDOUT, EAI_AGAIN or EPIPE, or if the name is `TimeoutError`.
- **Terminal.** ENOTFOUND, ECONNABORTED, `AbortError` (a deliberate cancel, not a timeout), and any error with no marker, such as a domain rejection.
- **Retry-After** is read on 429 only. It must be digits after trim(). Values above 2147483647 ms are ignored.
- **Terminal statuses include** 404, 408 and all other 4xx and 5xx except 429, 502, 503 and 504.

**Decided:** 502 and 504 are retryable, because gateway and proxy errors are usually transient. 500 stays terminal: it can mean a bad request body, so a retry is unlikely to help. This is a judgement call, not a value from the brief. It is a one-line change in `src/infra/retry.ts` if the product owner wants otherwise.

## Processing decisions

- **Version rule.** A change applies only if `sourceVersion` is greater than the last applied version for its stock key. Equal or lower versions are skipped as stale. The check runs twice: before the context lookup and again under the lease, so concurrent deliveries cannot both apply.
- **Version advances after the gateway write.** The version is recorded in the same transaction as the outbox row. If the gateway call fails, the version stays put and a retry applies it. A gateway success followed by a DB failure re-sends the same version on retry, which is idempotent.
- **Unknown, inactive, or not-enabled products are rejected** with a reason (`product context not found`, `product is not active`, `product is not enabled in country`). Rejections are not retried and produce no gateway write or event.
- **Stale rows in bulk are skipped, not failed.** They are counted in `skippedRows` and are not listed in `errors`. A stale row never fails the upload.
- **Row-level partial failure.** A bulk job ends `COMPLETED_WITH_ERRORS` if any row failed. Errors list FAILED rows only, with file line numbers (header is line 1).
- **Per-key lease (`LEASE_TTL_MS`, default 30 s).** Serialises writes for one stock key across requests and jobs. A busy key is a retryable row failure. The holder renews the lease every TTL/3 and only while it is unexpired and still its own, so a stalled holder cannot revive an expired lease. Every HTTP call has a timeout (`HTTP_TIMEOUT_MS`, default 5 s).
- **Residual risk: no fencing at the gateway.** The PUT body carries `sourceVersion`, but the contract does not say the gateway rejects an older one, so the processor cannot rely on it. Scenario: holder A passes the lease check, its PUT for version 7 is in flight, A stalls past the TTL, B applies version 8 and commits it, then A's PUT lands. The gateway now holds 7. A's commit fails with `stock lease lost` (retryable). The retry runs the version check first, sees 8 is applied, and returns `SKIPPED_STALE` without a PUT. Result: the DB and outbox are correct at 8, the gateway is stale at 7 until the next change for that key. Accepted for this brief.
- **Ordering within a key.** Rows for the same stock key in one upload run in order. Different keys run in parallel up to `CONCURRENCY`.
- **Deterministic outbox event id** (`<stockKey>|v<sourceVersion>`). The assignment says `eventId` may change on replay, so the id is not taken from the inbound event. Consumers deduplicate on this id.
- **Outbox at-least-once, per-key order.** Events are written in the same transaction as the version. Only the oldest pending row of each stock key is attempted, so later rows never overtake an earlier one. A failed row backs off, doubling from `RETRY_BASE_MS` and capped at `RETRY_MAX_MS`.
- **Outbox dead-letter (`OUTBOX_MAX_ATTEMPTS`, default 10).** When a row's attempts reach the cap, it is marked dead (`dead_at_ms`) and keeps its `last_error`. Dead rows are not retried and no longer hold their key, so the next row for that key is published. Trade-off: that one event is lost from order, and never sent. Events carry the absolute `availableQuantity`, so a later event for the same key restores the consumer's state, except when the dead event was the last one for its key. The processor has no replay for dead rows; they stay in the table for inspection.
- **Snapshot matching.** One country snapshot per job, indexed by `(productId, sizeId, countryCode)`. Chosen over per-row lookups to avoid N gateway calls for a 10,000-row upload. Trade-off: memory is O(N) for the job.
- **Production broker: Kafka**, keyed by stock key, with idempotent producers and consumer-side deduplication on `eventId`. The outbox table bridges the DB transaction and the broker. Alternatives considered: publishing inline (loses events on crash), a cloud queue (no ordering per key without extra work).
- **Restart recovery.** On start, `RUNNING` jobs go back to `QUEUED` and resume after their last recorded line. Recorded rows and counters are kept. Chosen over restarting from scratch, which would double-count rows already applied. Known edge: `recordChunk` runs after the row's own transaction, so a crash between the two can leave a row that was applied but reported as skipped on resume. The stock state, version and outbox are correct; only that line's entry in the job report is wrong.
- **Sink fault triggers are not honoured.** The mock picks its fault from the `eventId` (`fault-429`, `fault-503`), and the deterministic `eventId` never produces those values. The 429 and 503 sink paths are covered by unit tests against a fake sink instead.
- **Dev routes** are on unless `NODE_ENV=production`, so the local flow works without extra configuration.

