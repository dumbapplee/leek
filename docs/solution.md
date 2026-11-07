# Solution

## What it does

The Size-Level Availability Processor receives seller inventory changes, enriches them with product context, writes the availability to the availability gateway, and publishes a `SizeAvailabilityUpdated` event. It also accepts bulk CSV uploads and reports job progress and row-level errors.

## Architecture

| Area | Files | Role |
|---|---|---|
| Entry | `src/main.ts`, `src/server.ts`, `src/services.ts` | Startup, Express app, wiring |
| Config | `src/config.ts` | The only place config is read |
| Routes | `src/routes/devMessages.ts`, `src/routes/imports.ts` | HTTP surface |
| Validation | `src/domain/validation.ts`, `src/domain/countryCodes.ts` | Message and CSV validation, ISO alpha-2 check |
| Pipeline | `src/pipeline/processStockChange.ts`, `src/pipeline/keyLease.ts` | Single change flow and per-key lease |
| Version store | `src/stores/versionStore.ts` | Atomic apply of `sourceVersion` |
| Clients | `src/clients/*.ts` | Product context, availability gateway, HTTP with retry |
| Snapshot index | `src/index/snapshotIndex.ts` | Per-job country snapshot for bulk matching |
| Bulk import | `src/imports/bulkImportWorker.ts`, `src/imports/importJobs.ts` | Job queue, chunked processing, job state |
| Outbox | `src/outbox/outboxPublisher.ts` | Event queue and publisher to the event sink |
| Persistence | `src/infra/db.ts`, `src/infra/schema.ts` | SQLite (better-sqlite3), schema applied at startup |
| Retry | `src/infra/retry.ts` | Retry classification and jittered backoff |

## Data flow

**Single change (`POST /_dev/messages`)**

1. Validate the message. Invalid input returns 400.
2. Skip if `sourceVersion` is not newer than the applied version.
3. Look up product context for `(productId, sizeId, countryCode)`.
4. Reject if not found, inactive, or not enabled in the country (422).
5. Take the per-key lease.
6. PUT the availability to the gateway.
7. In one transaction, record the version and enqueue the outbox event.
8. Release the lease. The publisher later posts the event to the sink.

HTTP status: `APPLIED` and `SKIPPED_STALE` return 200, `REJECTED` returns 422, `FAILED` returns 502.

**Bulk upload (`POST /v1/availability/imports`)**

1. Validate the header and body. Empty body or bad header returns 400.
2. Store the job as `QUEUED` and return 202 with `jobId` and `statusUrl`.
3. The worker processes the CSV in chunks. Rows are grouped by stock key. Groups run in parallel up to `CONCURRENCY`. Rows within a group run in order.
4. Each row is applied, skipped as stale, or failed, using the same rules as the single change flow.
5. The job finishes as `COMPLETED` or `COMPLETED_WITH_ERRORS`.

**Status (`GET /v1/availability/imports/:jobId`)** returns the state, counts, and FAILED row errors with pagination (`limit`, `offset`).

**Outbox.** The publisher runs every second. For each stock key it posts the oldest pending events, up to `CHUNK_SIZE`, in order to `${EVENT_SINK_BASE_URL}/mock-broker/v1/events`. A 2xx marks the event published. A failure increments its attempt count, stores the error, and holds back the later events of that key until the retry time, which backs off from `RETRY_BASE_MS` up to `RETRY_MAX_MS`. When the attempt count reaches `OUTBOX_MAX_ATTEMPTS`, the event is dead-lettered (`dead_at_ms` is set): it is no longer retried and no longer holds its key. Other keys are not blocked.

**Restart.** On start, `RUNNING` import jobs are reset to `QUEUED` with their counters cleared and are processed again.

## Run and configure

See the root [README.md](../README.md#run). Config keys are listed there and defined in [src/config.ts](../src/config.ts).

## Limits

See the root [README.md](../README.md#known-limits).
