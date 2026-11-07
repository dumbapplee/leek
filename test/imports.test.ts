import { afterEach, describe, expect, it, vi } from 'vitest';
import { context, json, realFetch, stubFetch, useTestApp } from './fixtures.js';

const start = useTestApp();

const header = 'sellerId,productId,sizeId,countryCode,availableQuantity,sourceVersion';
const applied = 'boutique-42,style-123,size-40,PT,3,1';
const replayed = 'boutique-42,style-123,size-38,PT,3,9';
const unknownProduct = 'boutique-42,style-999,size-38,PT,3,1';

interface JobBody {
  jobId?: string;
  state?: string;
  totalRows?: number;
  processedRows?: number;
  succeededRows?: number;
  failedRows?: number;
  skippedRows?: number;
  errors?: Array<{ line: number; reason: string }>;
  error?: string;
}

function stubDownstream(): ReturnType<typeof stubFetch> {
  return stubFetch((url) => {
    if (url.includes('/v1/product-contexts/snapshot')) {
      return json([context(), context({ sizeId: 'size-40', sizeLabel: 'EU 40' })]);
    }
    if (url.includes('/v1/products/style-123/')) {
      return json(context());
    }
    if (url.includes('/v1/products/style-999/')) {
      return json({}, 404);
    }
    return json({});
  });
}

function upload(baseUrl: string, csv: string, contentType = 'text/csv'): Promise<Response> {
  return realFetch(`${baseUrl}/v1/availability/imports`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: csv,
  });
}

async function readJob(baseUrl: string, jobId: string, query = ''): Promise<Response> {
  return realFetch(`${baseUrl}/v1/availability/imports/${jobId}${query}`);
}

async function waitForCompletion(baseUrl: string, jobId: string): Promise<JobBody> {
  let body: JobBody = {};
  await vi.waitFor(async () => {
    body = (await (await readJob(baseUrl, jobId)).json()) as JobBody;
    expect(['COMPLETED', 'COMPLETED_WITH_ERRORS']).toContain(body.state);
  });
  return body;
}

describe('POST /v1/availability/imports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 202 with a job handle for a valid upload', async () => {
    const app = await start();
    stubDownstream();

    const response = await upload(app.baseUrl, `${header}\n${applied}\n`);
    const body = (await response.json()) as JobBody;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      state: 'QUEUED',
      totalRows: 1,
      statusUrl: `/v1/availability/imports/${body.jobId}`,
    });
    expect(body.jobId).toEqual(expect.any(String));
    await waitForCompletion(app.baseUrl, body.jobId ?? '');
  });

  it('answers 400 when the header does not match the contract', async () => {
    const app = await start();

    const response = await upload(app.baseUrl, `sellerId,productId\n${applied}\n`);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid CSV header' });
  });

  it('answers 400 when the body is blank', async () => {
    const app = await start();

    const response = await upload(app.baseUrl, '   \n');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'expected a non-empty text/csv body' });
  });

  it('answers 400 when the content type is not text/csv', async () => {
    const app = await start();

    const response = await upload(app.baseUrl, `${header}\n${applied}\n`, 'application/json');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'expected a non-empty text/csv body' });
  });

  it('completes a mixed job with succeeded, skipped and failed rows', async () => {
    const app = await start();
    stubDownstream();
    await realFetch(`${app.baseUrl}/_dev/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'msg-0009',
        eventType: 'SellerInventoryChanged',
        schemaVersion: 1,
        occurredAt: '2026-10-20T08:00:00Z',
        sellerId: 'boutique-42',
        productId: 'style-123',
        sizeId: 'size-38',
        countryCode: 'PT',
        availableQuantity: 3,
        sourceVersion: 9,
      }),
    });

    const created = (await (
      await upload(app.baseUrl, `${header}\n${applied}\n${replayed}\n${unknownProduct}\n`)
    ).json()) as JobBody;
    const body = await waitForCompletion(app.baseUrl, created.jobId ?? '');

    expect(body).toMatchObject({
      state: 'COMPLETED_WITH_ERRORS',
      totalRows: 3,
      processedRows: 3,
      succeededRows: 1,
      failedRows: 1,
      skippedRows: 1,
      errors: [{ line: 4, reason: 'product context not found' }],
    });
  });
});

describe('GET /v1/availability/imports/:jobId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 404 for an unknown job', async () => {
    const app = await start();

    const response = await readJob(app.baseUrl, 'does-not-exist');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'job not found' });
  });

  it('answers 400 for a negative limit', async () => {
    const app = await start();
    stubDownstream();
    const created = (await (await upload(app.baseUrl, `${header}\n${applied}\n`)).json()) as JobBody;
    await waitForCompletion(app.baseUrl, created.jobId ?? '');

    const response = await readJob(app.baseUrl, created.jobId ?? '', '?limit=-1');

    expect(response.status).toBe(400);
  });
});
