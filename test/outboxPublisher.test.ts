import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from '../src/infra/db.js';
import { createOutboxPublisher } from '../src/outbox/outboxPublisher.js';
import { httpDeps, json, stubFetch } from './fixtures.js';

function insertEvent(db: Db, eventId: string, stockKey: string): void {
  db.prepare(`INSERT INTO outbox (event_id, stock_key, payload_json) VALUES (?, ?, ?)`).run(
    eventId,
    stockKey,
    JSON.stringify({ eventId }),
  );
}

function outboxRow(db: Db, eventId: string) {
  return db
    .prepare<
      [string],
      { publishedAt: number | null; attempts: number; lastError: string | null; deadAt: number | null }
    >(
      `SELECT published_at AS publishedAt, attempts, last_error AS lastError, dead_at_ms AS deadAt
       FROM outbox WHERE event_id = ?`,
    )
    .get(eventId);
}

function sentEventIds(spy: ReturnType<typeof stubFetch>): string[] {
  return spy.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { eventId: string }).eventId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createOutboxPublisher', () => {
  it('publishes each stock key in order and holds its later rows behind a failed head', async () => {
    const db = openDatabase(':memory:');
    insertEvent(db, 'a-1', 'key-a');
    insertEvent(db, 'a-2', 'key-a');
    insertEvent(db, 'b-1', 'key-b');
    const fetchSpy = stubFetch((_url, init) =>
      (JSON.parse(String(init?.body)) as { eventId: string }).eventId === 'a-1'
        ? json({ error: 'busy' }, 503)
        : json({}, 200),
    );
    let clock = 1000;
    const publish = createOutboxPublisher(db, httpDeps, () => clock);

    expect(await publish()).toBe(1);
    expect(sentEventIds(fetchSpy).sort()).toEqual(['a-1', 'b-1']);
    expect(outboxRow(db, 'a-1')).toMatchObject({ publishedAt: null, attempts: 1, lastError: 'HTTP 503' });
    expect(outboxRow(db, 'a-2')).toMatchObject({ publishedAt: null, attempts: 0 });

    expect(await publish()).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockImplementation(async () => json({}, 200));
    clock = 1200;
    expect(await publish()).toBe(2);
    expect(sentEventIds(fetchSpy).slice(2)).toEqual(['a-1', 'a-2']);
    expect(outboxRow(db, 'a-1')?.publishedAt).not.toBeNull();
    expect(outboxRow(db, 'a-2')?.publishedAt).not.toBeNull();
  });

  it('dead-letters a row after outboxMaxAttempts failures and lets its key continue', async () => {
    const db = openDatabase(':memory:');
    insertEvent(db, 'a-1', 'key-a');
    insertEvent(db, 'a-2', 'key-a');
    const fetchSpy = stubFetch((_url, init) =>
      (JSON.parse(String(init?.body)) as { eventId: string }).eventId === 'a-1'
        ? json({ error: 'busy' }, 503)
        : json({}, 200),
    );
    const deps = { ...httpDeps, config: { ...httpDeps.config, outboxMaxAttempts: 2 } };
    let clock = 1000;
    const publish = createOutboxPublisher(db, deps, () => clock);

    expect(await publish()).toBe(0);
    expect(outboxRow(db, 'a-1')).toMatchObject({ publishedAt: null, attempts: 1, deadAt: null });

    clock = 1200;
    expect(await publish()).toBe(0);
    expect(outboxRow(db, 'a-1')).toMatchObject({
      publishedAt: null,
      attempts: 2,
      lastError: 'HTTP 503',
      deadAt: 1200,
    });

    clock = 1400;
    expect(await publish()).toBe(1);
    expect(sentEventIds(fetchSpy).slice(2)).toEqual(['a-2']);
    expect(outboxRow(db, 'a-2')?.publishedAt).not.toBeNull();

    expect(await publish()).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(outboxRow(db, 'a-1')?.publishedAt).toBeNull();
  });

  it('records a 429 from the sink and retries the row only after its backoff', async () => {
    const db = openDatabase(':memory:');
    insertEvent(db, 'a-1', 'key-a');
    const fetchSpy = stubFetch(() => json({ error: 'slow down' }, 429));
    let clock = 1000;
    const publish = createOutboxPublisher(db, httpDeps, () => clock);

    expect(await publish()).toBe(0);
    expect(outboxRow(db, 'a-1')).toMatchObject({ publishedAt: null, attempts: 1, lastError: 'HTTP 429' });

    clock = 1199;
    expect(await publish()).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockImplementation(async () => json({}, 200));
    clock = 1200;
    expect(await publish()).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
