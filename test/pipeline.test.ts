import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnrichFn } from '../src/clients/productContextClient.js';
import { openDatabase, type Db } from '../src/infra/db.js';
import { processStockChange, type PipelineDeps, type StockChange } from '../src/pipeline/processStockChange.js';
import { createVersionStore } from '../src/stores/versionStore.js';
import { context, httpDeps, json, stubFetch } from './fixtures.js';

const change: StockChange = {
  sellerId: 'seller-1',
  productId: 'style-123',
  sizeId: 'size-38',
  countryCode: 'PT',
  availableQuantity: 5,
  sourceVersion: 10,
};

const foundEnrich: EnrichFn = async () => ({ kind: 'found', context: context() });

function setup(enrich: EnrichFn = foundEnrich) {
  const db: Db = openDatabase(':memory:');
  const versions = createVersionStore(db);
  const deps: PipelineDeps = { db, versions, http: httpDeps, enrich, now: () => Date.UTC(2025, 0, 1) };
  return { db, versions, deps };
}

function outboxCount(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM outbox').get() as { n: number }).n;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processStockChange', () => {
  it('applies a new version once and queues one outbox event', async () => {
    const { db, deps } = setup();
    const fetchSpy = stubFetch(() => json({}, 200));

    expect(await processStockChange(deps, change)).toEqual({ kind: 'APPLIED' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outboxCount(db)).toBe(1);
  });

  it('skips a replayed version without calling the gateway again', async () => {
    const { db, deps } = setup();
    const fetchSpy = stubFetch(() => json({}, 200));

    await processStockChange(deps, change);
    expect(await processStockChange(deps, change)).toEqual({ kind: 'SKIPPED_STALE' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outboxCount(db)).toBe(1);
  });

  it('skips an older version after a newer one was applied', async () => {
    const { deps } = setup();
    const fetchSpy = stubFetch(() => json({}, 200));

    await processStockChange(deps, change);
    expect(await processStockChange(deps, { ...change, sourceVersion: 9 })).toEqual({ kind: 'SKIPPED_STALE' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown product without calling the gateway', async () => {
    const { db, deps } = setup(async () => ({ kind: 'not_found' }));
    const fetchSpy = stubFetch(() => json({}, 200));

    expect(await processStockChange(deps, change)).toEqual({
      kind: 'REJECTED',
      reason: 'product context not found',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outboxCount(db)).toBe(0);
  });

  it('rejects an inactive product without calling the gateway', async () => {
    const { deps } = setup(async () => ({ kind: 'found', context: context({ productStatus: 'INACTIVE' }) }));
    const fetchSpy = stubFetch(() => json({}, 200));

    expect(await processStockChange(deps, change)).toEqual({ kind: 'REJECTED', reason: 'product is not active' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a product not enabled in the country without calling the gateway', async () => {
    const { deps } = setup(async () => ({ kind: 'found', context: context({ countryEnabled: false }) }));
    const fetchSpy = stubFetch(() => json({}, 200));

    expect(await processStockChange(deps, change)).toEqual({
      kind: 'REJECTED',
      reason: 'product is not enabled in country',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the version unapplied when the gateway fails, so a retry can apply it', async () => {
    const { db, versions, deps } = setup();
    const fetchSpy = stubFetch(() => json({ error: 'unavailable' }, 503));

    const failed = await processStockChange(deps, change);
    expect(failed).toMatchObject({ kind: 'FAILED', retryable: true });
    expect(versions.readApplied(change)).toBeUndefined();
    expect(outboxCount(db)).toBe(0);

    fetchSpy.mockImplementation(async () => json({}, 200));
    expect(await processStockChange(deps, change)).toEqual({ kind: 'APPLIED' });
    expect(outboxCount(db)).toBe(1);
  });

  it('keeps the version unapplied when the lease is lost during the gateway write', async () => {
    const { db, versions, deps } = setup();
    stubFetch(() => {
      db.prepare(`UPDATE stock_leases SET owner = 'other-worker', expires_at_ms = 0`).run();
      return json({}, 200);
    });

    expect(await processStockChange(deps, change)).toEqual({
      kind: 'FAILED',
      retryable: true,
      reason: 'stock lease lost',
    });
    expect(versions.readApplied(change)).toBeUndefined();
    expect(outboxCount(db)).toBe(0);
  });

  it('classifies an unexpected programming error as terminal', async () => {
    const { deps } = setup(async () => {
      throw new TypeError('boom');
    });

    expect(await processStockChange(deps, change)).toEqual({ kind: 'FAILED', retryable: false, reason: 'boom' });
  });
});
