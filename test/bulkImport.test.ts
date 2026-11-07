import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/infra/db.js';
import { createImportWorker, validateUpload } from '../src/imports/bulkImportWorker.js';
import {
  createJob,
  markRunning,
  readJobStatus,
  readRecordedLines,
  recordChunk,
  recoverRunningJobs,
} from '../src/imports/importJobs.js';
import { createVersionStore } from '../src/stores/versionStore.js';
import { context, httpDeps, json, stubFetch } from './fixtures.js';

const header = 'sellerId,productId,sizeId,countryCode,availableQuantity,sourceVersion';
const rowOne = 'seller-1,style-123,size-38,PT,5,10';
const rowTwo = 'seller-1,style-123,size-38,PT,6,11';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateUpload', () => {
  it('accepts a UTF-8 BOM before the header', () => {
    expect(validateUpload(`\uFEFF${header}\n${rowOne}\n`)).toEqual({ ok: true, value: 1 });
  });
});

describe('bulk import resume', () => {
  it('keeps recorded rows and counters when a running job is recovered', () => {
    const db = openDatabase(':memory:');
    const jobId = createJob(db, `${header}\n${rowOne}\n${rowTwo}\n`, 2, 0);
    markRunning(db, jobId, 0);
    recordChunk(db, jobId, [{ lineNumber: 2, outcome: 'APPLIED' }], 0);

    recoverRunningJobs(db, 1);

    expect(readJobStatus(db, jobId)).toMatchObject({ state: 'QUEUED', totalRows: 2, succeededRows: 1 });
    expect(readRecordedLines(db, jobId)).toEqual(new Set([2]));
  });

  it('processes only the lines that were not recorded before the restart', async () => {
    const db = openDatabase(':memory:');
    const jobId = createJob(db, `${header}\n${rowOne}\n${rowTwo}\n`, 2, 0);
    markRunning(db, jobId, 0);
    recordChunk(db, jobId, [{ lineNumber: 2, outcome: 'APPLIED' }], 0);
    recoverRunningJobs(db, 1);
    const fetchSpy = stubFetch((url) => (url.includes('/v1/product-contexts/snapshot') ? json([context()]) : json({})));

    createImportWorker({ db, versions: createVersionStore(db), http: httpDeps, now: () => 2 }).kick();
    await vi.waitFor(() => expect(readJobStatus(db, jobId)?.state).toBe('COMPLETED'));

    const writes = fetchSpy.mock.calls.filter(([url]) => String(url).startsWith(httpDeps.config.availabilityBaseUrl));
    expect(writes).toHaveLength(1);
    expect(readJobStatus(db, jobId)).toMatchObject({ succeededRows: 2, failedRows: 0, skippedRows: 0 });
    expect(readRecordedLines(db, jobId)).toEqual(new Set([2, 3]));
  });
});
