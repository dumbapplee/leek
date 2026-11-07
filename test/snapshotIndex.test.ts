import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSnapshotLookup } from '../src/index/snapshotIndex.js';
import { context, httpDeps, json, stubFetch } from './fixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSnapshotLookup', () => {
  it('loads a country snapshot once and serves later lookups from it', async () => {
    const fetchSpy = stubFetch(() => json([context()]));
    const lookup = createSnapshotLookup(httpDeps);

    expect(await lookup('style-123', 'size-38', 'PT')).toEqual({ kind: 'found', context: context() });
    expect(await lookup('style-123', 'size-38', 'PT')).toEqual({ kind: 'found', context: context() });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed snapshot so the next lookup loads it again', async () => {
    const fetchSpy = stubFetch(() => json([context()]));
    fetchSpy.mockImplementationOnce(async () => json({ error: 'bad request' }, 400));
    const lookup = createSnapshotLookup(httpDeps);

    expect(await lookup('style-123', 'size-38', 'PT')).toEqual({
      kind: 'failed',
      retryable: true,
      reason: 'snapshot unavailable: HTTP 400',
    });
    expect(await lookup('style-123', 'size-38', 'PT')).toEqual({ kind: 'found', context: context() });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
