import { randomUUID } from 'node:crypto';
import type { Db } from '../infra/db.js';

const leasePollMs = 25;

interface LeaseDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export async function acquireLease(
  db: Db,
  stockKey: string,
  ttlMs: number,
  deps: LeaseDeps,
): Promise<string | undefined> {
  const owner = randomUUID();
  const deadline = deps.now() + ttlMs;
  for (;;) {
    const nowMs = deps.now();
    if (tryAcquire(db, stockKey, owner, nowMs + ttlMs, nowMs)) {
      return owner;
    }
    if (nowMs >= deadline) {
      return undefined;
    }
    await deps.sleep(leasePollMs);
  }
}

export function releaseLease(db: Db, stockKey: string, owner: string): void {
  db.prepare(`DELETE FROM stock_leases WHERE stock_key = ? AND owner = ?`).run(stockKey, owner);
}

export interface HeldLease {
  isHeld: () => boolean;
  stop: () => void;
}

// Renewal only succeeds while the lease is unexpired and still owned, so a holder that
// stalled past its TTL cannot silently resume once another worker has taken the key.
export function keepLeaseAlive(db: Db, stockKey: string, owner: string, ttlMs: number, now: () => number): HeldLease {
  const isHeld = (): boolean => renewLease(db, stockKey, owner, now(), ttlMs);
  const timer = setInterval(isHeld, Math.max(1, Math.floor(ttlMs / 3)));
  timer.unref();
  return { isHeld, stop: () => clearInterval(timer) };
}

function renewLease(db: Db, stockKey: string, owner: string, nowMs: number, ttlMs: number): boolean {
  const { changes } = db
    .prepare(
      `UPDATE stock_leases SET expires_at_ms = ?
       WHERE stock_key = ? AND owner = ? AND expires_at_ms > ?`,
    )
    .run(nowMs + ttlMs, stockKey, owner, nowMs);
  return changes === 1;
}

function tryAcquire(db: Db, stockKey: string, owner: string, expiresAtMs: number, nowMs: number): boolean {
  const { changes } = db
    .prepare(
      `INSERT INTO stock_leases (stock_key, owner, expires_at_ms) VALUES (?, ?, ?)
       ON CONFLICT (stock_key)
       DO UPDATE SET owner = excluded.owner, expires_at_ms = excluded.expires_at_ms
       WHERE stock_leases.expires_at_ms <= ?`,
    )
    .run(stockKey, owner, expiresAtMs, nowMs);
  return changes === 1;
}
