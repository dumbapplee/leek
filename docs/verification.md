# Verification

## Status

Typecheck, unit tests and build were run on Windows (cmd) and passed. The end-to-end run against the Docker mocks was done once on Windows and passed (see below). The sign-off required by the documentation skill has not happened.

## Latest run

| Command | Result |
|---|---|
| `npm run typecheck` | Passed, no errors. |
| `npm test` | Passed. 15 files, 329 tests. |
| `npm run build` | Passed, no errors. |

## Results by wave

| Wave | Scope | Result |
|---|---|---|
| 1 | Config, health | Passed in the latest run (config, health). |
| 2 | Input validation, retry policy, SQLite schema | Passed in the latest run. |
| 3 to 6 | Version store and pipeline | Passed in the latest run, including lease loss and terminal `TypeError` (`test/pipeline.test.ts`). |
| 3 to 6 | Clients, lease, outbox, bulk import | Passed in the latest run (`test/httpJson.test.ts`, `test/keyLease.test.ts`, `test/outboxPublisher.test.ts`, `test/snapshotIndex.test.ts`, `test/csvLine.test.ts`, `test/bulkImport.test.ts`). |
| 3 to 6 | Routes | Passed in the latest run (`test/devMessages.test.ts`, `test/imports.test.ts`). Uses the real HTTP server, no Docker. |
| 7 | End to end against WireMock | Passed. Sample event and 10,000-row CSV (see [End-to-end run](#end-to-end-run)). |


## End-to-end run

Run on Windows after the dead-letter change: `docker compose up -d` (WireMock 3.13.2, healthy), `npm run build`, `npm start` on port 3000 with a fresh `data/processor.db`. The journal was reset before the run.

| Step | Result |
|---|---|
| `POST /_dev/messages` with `wiremock\__files\sample-event.json` | `200 {"kind":"APPLIED"}` |
| `POST /v1/availability/imports` with `wiremock\__files\bulk-stock.csv` | 202, `totalRows` 10000 |
| Job status polled every 250 ms | 0 non-200 responses. `RUNNING` to `COMPLETED` in about 16 s. Final: 10000 succeeded, 0 failed, 0 skipped |
| Outbox after the job | 10001 rows, 10001 published, 0 dead, 0 pending (drained about 7 s after the job finished) |
| WireMock journal after drain | 10001 availability PUTs, all 200. 10001 sink POSTs to `/mock-broker/v1/events`, all 202. Plus 1 product-context snapshot GET and 1 product GET |

The job's throughput and the cause of the slow start (about 3 s before the first 500 rows) have not been measured.

Reading the journal before the outbox drained gives a false shortfall (about 5,000 sink POSTs at 1 s). Always wait for `pending = 0` before counting.

The earlier `404 {"error":"job not found"}` on the first status poll (about 5 s after the `202`, in the run before the dead-letter change) has not recurred: this run had zero non-200 polls. Its cause is still unknown. The code cannot delete `import_jobs` rows, and the row is inserted before the `202`.



From the repository root (cmd or PowerShell):

```
npm install
npm run typecheck
npm test
npm run build
docker compose up -d
npm start
```

Then send the sample input from the assignment and the README to `POST /_dev/messages` and `POST /v1/availability/imports`, and read the job status.

## Known gaps

- The product context and availability clients are tested through the pipeline and the snapshot lookup, not with their own tests.
- Sink fault triggers (`fault-429`, `fault-503` event ids in `MOCK-ENVIRONMENT.md`) are not honoured by design. The outbox event id is always `<stockKey>|v<sourceVersion>`, so the mock never injects them. This is decided, see [decisions.md](decisions.md). The 429 and 503 sink paths are covered by unit tests against a fake sink in `test/outboxPublisher.test.ts`.
- The gateway has no fencing token. A lease holder that stalls past its TTL can leave the gateway behind the DB: its in-flight PUT lands after a newer version, and the retry is `SKIPPED_STALE`, so no one re-sends the newer value. See [decisions.md](decisions.md).
- The outbox dead-letters a row after `OUTBOX_MAX_ATTEMPTS` failures. It is not replayed, and the later events of its key go out in order. Covered by `test/outboxPublisher.test.ts`. There is no replay tool.
- Performance has not been measured. The complexity analysis is in the root README.
