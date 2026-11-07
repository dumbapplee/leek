import { describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../src/infra/db.js';
import { acquireLease, keepLeaseAlive, releaseLease } from '../src/pipeline/keyLease.js';

const key = 'seller-1|style-123|size-38|PT';
const ttlMs = 100;

function clock(start: number) {
  let nowMs = start;
  return {
    now: () => nowMs,
    set: (value: number) => {
      nowMs = value;
    },
    sleep: async (ms: number) => {
      nowMs += ms;
    },
  };
}

async function acquire(db: Db, ttl: number, deps: { now: () => number; sleep: (ms: number) => Promise<void> }) {
  const owner = await acquireLease(db, key, ttl, deps);
  if (owner === undefined) {
    throw new Error('lease not acquired');
  }
  return owner;
}

describe('key lease', () => {
  it('returns undefined when the key stays busy past the wait deadline', async () => {
    const db = openDatabase(':memory:');
    const time = clock(0);
    await acquire(db, 1000, time);

    expect(await acquireLease(db, key, ttlMs, time)).toBeUndefined();
  });

  it('lets a waiter take over once the holder lease has expired', async () => {
    const db = openDatabase(':memory:');
    const time = clock(0);
    await acquire(db, ttlMs, time);

    time.set(ttlMs);
    expect(await acquireLease(db, key, ttlMs, time)).toEqual(expect.any(String));
  });

  it('keeps a held lease alive and rejects a holder that stalled past its expiry', async () => {
    const db = openDatabase(':memory:');
    const time = clock(0);
    const owner = await acquire(db, ttlMs, time);
    const lease = keepLeaseAlive(db, key, owner, ttlMs, time.now);

    time.set(80);
    expect(lease.isHeld()).toBe(true);
    time.set(170);
    expect(lease.isHeld()).toBe(true);

    time.set(400);
    expect(await acquire(db, ttlMs, time)).toEqual(expect.any(String));
    expect(lease.isHeld()).toBe(false);
    lease.stop();
  });

  it('frees the key only when released by its owner', async () => {
    const db = openDatabase(':memory:');
    const time = clock(0);
    const owner = await acquire(db, 1000, time);

    releaseLease(db, key, 'someone-else');
    expect(await acquireLease(db, key, ttlMs, time)).toBeUndefined();

    releaseLease(db, key, owner);
    expect(await acquireLease(db, key, ttlMs, time)).toEqual(expect.any(String));
  });
});
