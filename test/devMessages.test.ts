import { afterEach, describe, expect, it, vi } from 'vitest';
import { context, json, realFetch, stubFetch, testConfig, useTestApp } from './fixtures.js';

const start = useTestApp();

const sampleEvent = {
  eventId: 'msg-0001',
  eventType: 'SellerInventoryChanged',
  schemaVersion: 1,
  occurredAt: '2026-10-20T08:00:00Z',
  sellerId: 'boutique-42',
  productId: 'style-123',
  sizeId: 'size-38',
  countryCode: 'PT',
  availableQuantity: 3,
  sourceVersion: 7,
};

interface ChangeBody {
  kind: string;
  reason?: string;
  retryable?: boolean;
  errors?: unknown[];
}

function stubDownstream(lookupStatus = 200, gatewayStatus = 200) {
  return stubFetch((url) => {
    if (url.startsWith(testConfig.productContextBaseUrl)) {
      return lookupStatus === 200 ? json(context()) : json({}, lookupStatus);
    }
    return json({}, gatewayStatus);
  });
}

function gatewayCalls(fetchSpy: ReturnType<typeof stubDownstream>): unknown[][] {
  return fetchSpy.mock.calls.filter(([url]) => String(url).startsWith(testConfig.availabilityBaseUrl));
}

function postMessage(baseUrl: string, body: unknown): Promise<Response> {
  return realFetch(`${baseUrl}/_dev/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /_dev/messages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 200 with APPLIED for a new version', async () => {
    const app = await start();
    stubDownstream();

    const response = await postMessage(app.baseUrl, sampleEvent);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: 'APPLIED' });
  });

  it('writes the availability gateway once for a new version', async () => {
    const app = await start();
    const fetchSpy = stubDownstream();

    await postMessage(app.baseUrl, sampleEvent);

    expect(gatewayCalls(fetchSpy)).toHaveLength(1);
  });

  it('answers 200 with SKIPPED_STALE when the same version is replayed', async () => {
    const app = await start();
    stubDownstream();
    await postMessage(app.baseUrl, sampleEvent);

    const response = await postMessage(app.baseUrl, sampleEvent);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: 'SKIPPED_STALE' });
  });

  it('answers 400 with INVALID and field errors for a malformed body', async () => {
    const app = await start();

    const response = await postMessage(app.baseUrl, {});
    const body = (await response.json()) as ChangeBody;

    expect(response.status).toBe(400);
    expect(body.kind).toBe('INVALID');
    expect(body.errors).toEqual(expect.any(Array));
    expect(body.errors).not.toHaveLength(0);
  });

  it('answers 422 with REJECTED and writes nothing when the product context is not found', async () => {
    const app = await start();
    const fetchSpy = stubDownstream(404);

    const response = await postMessage(app.baseUrl, sampleEvent);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ kind: 'REJECTED', reason: 'product context not found' });
    expect(gatewayCalls(fetchSpy)).toHaveLength(0);
  });

  it('answers 502 with a non-retryable FAILED for a terminal gateway error', async () => {
    const app = await start();
    stubDownstream(200, 500);

    const response = await postMessage(app.baseUrl, sampleEvent);
    const body = (await response.json()) as ChangeBody;

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ kind: 'FAILED', retryable: false });
  });

  it('does not mount the route when dev routes are disabled', async () => {
    const app = await start({ enableDevRoutes: false });
    stubDownstream();

    const response = await postMessage(app.baseUrl, sampleEvent);

    expect(response.status).toBe(404);
  });
});
