import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/infra/db.js';
import { createVersionStore } from '../src/stores/versionStore.js';

const key = { sellerId: 'seller-1', productId: 'style-123', sizeId: 'size-38', countryCode: 'PT' };

describe('createVersionStore', () => {
  it('applies the first version of a key', () => {
    const store = createVersionStore(openDatabase(':memory:'));
    expect(store.readApplied(key)).toBeUndefined();
    expect(store.tryApply(key, 5)).toBe('APPLIED');
    expect(store.readApplied(key)).toBe(5);
  });

  it('reports an equal version as stale', () => {
    const store = createVersionStore(openDatabase(':memory:'));
    store.tryApply(key, 5);
    expect(store.tryApply(key, 5)).toBe('STALE');
  });

  it('reports a lower version as stale and keeps the higher one', () => {
    const store = createVersionStore(openDatabase(':memory:'));
    store.tryApply(key, 5);
    expect(store.tryApply(key, 4)).toBe('STALE');
    expect(store.readApplied(key)).toBe(5);
  });

  it('applies a higher version', () => {
    const store = createVersionStore(openDatabase(':memory:'));
    store.tryApply(key, 5);
    expect(store.tryApply(key, 6)).toBe('APPLIED');
    expect(store.readApplied(key)).toBe(6);
  });

  it('tracks each stock key independently', () => {
    const store = createVersionStore(openDatabase(':memory:'));
    store.tryApply(key, 5);
    expect(store.readApplied({ ...key, countryCode: 'ES' })).toBeUndefined();
    expect(store.tryApply({ ...key, countryCode: 'ES' }, 1)).toBe('APPLIED');
  });
});
