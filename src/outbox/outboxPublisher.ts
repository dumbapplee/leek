import type { Db } from '../infra/db.js';
import { mapWithConcurrency } from '../infra/mapWithConcurrency.js';
import { stockKeyText, type StockKey } from '../domain/stockKey.js';
import type { SizeAvailabilityUpdated } from '../domain/sizeAvailabilityUpdated.js';
import { failureReason, sendJson, type HttpDeps } from '../clients/httpJson.js';

export function enqueueEvent(db: Db, key: StockKey, event: SizeAvailabilityUpdated): void {
  db.prepare(`INSERT OR IGNORE INTO outbox (event_id, stock_key, payload_json) VALUES (?, ?, ?)`).run(
    event.eventId,
    stockKeyText(key),
    JSON.stringify(event),
  );
}

interface OutboxRow {
  id: number;
  payload_json: string;
  attempts: number;
  next_attempt_at_ms: number;
}

interface KeyRow {
  stock_key: string;
}

// Per-key order is preserved by publishing only the oldest pending row of each key; a failed
// row blocks its successors until its backoff elapses. A row that exhausts outboxMaxAttempts is
// dead-lettered and stops blocking, so its successors go out and only that event is lost from order.
export function createOutboxPublisher(db: Db, deps: HttpDeps, now: () => number): () => Promise<number> {
  const { chunkSize, concurrency, retryBaseMs, retryMaxMs, outboxMaxAttempts, eventSinkBaseUrl } = deps.config;
  const sinkUrl = `${eventSinkBaseUrl}/mock-broker/v1/events`;
  const selectReadyKeys = db.prepare<[number, number], KeyRow>(
    `SELECT stock_key FROM outbox o
     WHERE published_at IS NULL AND dead_at_ms IS NULL
       AND id = (
         SELECT MIN(i.id) FROM outbox i
         WHERE i.stock_key = o.stock_key AND i.published_at IS NULL AND i.dead_at_ms IS NULL
       )
       AND next_attempt_at_ms <= ?
     ORDER BY id
     LIMIT ?`,
  );
  const selectHead = db.prepare<[string], OutboxRow>(
    `SELECT id, payload_json, attempts, next_attempt_at_ms FROM outbox
     WHERE stock_key = ? AND published_at IS NULL AND dead_at_ms IS NULL
     ORDER BY id
     LIMIT 1`,
  );
  const markPublished = db.prepare(`UPDATE outbox SET published_at = ?, last_error = NULL WHERE id = ?`);
  const markFailed = db.prepare(
    `UPDATE outbox
     SET attempts = attempts + 1,
         last_error = ?,
         next_attempt_at_ms = ?,
         dead_at_ms = CASE WHEN attempts + 1 >= ? THEN ? END
     WHERE id = ?`,
  );

  async function publishKey(stockKey: string): Promise<number> {
    let published = 0;
    while (published < chunkSize) {
      const row = selectHead.get(stockKey);
      if (row === undefined || row.next_attempt_at_ms > now()) {
        break;
      }
      try {
        await sendJson(deps, sinkUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: row.payload_json,
        });
        markPublished.run(now(), row.id);
        published += 1;
      } catch (error) {
        const failedAt = now();
        const delayMs = Math.min(retryMaxMs, retryBaseMs * 2 ** row.attempts);
        markFailed.run(failureReason(error), failedAt + delayMs, outboxMaxAttempts, failedAt, row.id);
        break;
      }
    }
    return published;
  }

  async function publishBatch(): Promise<number> {
    const keys = selectReadyKeys.all(now(), chunkSize);
    const counts = await mapWithConcurrency(keys, concurrency, (key) => publishKey(key.stock_key));
    return counts.reduce((total, count) => total + count, 0);
  }

  let inFlight: Promise<number> | undefined;
  return () => {
    inFlight ??= publishBatch().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}
