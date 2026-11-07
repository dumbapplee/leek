import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { HttpStatusError, sendJson, type HttpDeps } from '../src/clients/httpJson.js';
import { isRetryable } from '../src/infra/retry.js';

const deps: HttpDeps = { config: loadConfig({ HTTP_TIMEOUT_MS: '10' }), sleep: async () => undefined };

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendJson', () => {
  it('aborts a request that exceeds HTTP_TIMEOUT_MS as a retryable failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => reject(signal.reason));
          }
        }),
    );

    const error = await rejectionOf(sendJson(deps, 'http://sink.test/events', { method: 'GET' }));
    expect(error).toMatchObject({ name: 'TimeoutError' });
    expect(isRetryable(error)).toBe(true);
  });

  it('throws HttpStatusError with the Retry-After header for a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }),
    );

    const error = await rejectionOf(sendJson(deps, 'http://sink.test/events', { method: 'GET' }));
    expect(error).toBeInstanceOf(HttpStatusError);
    expect(error).toMatchObject({ status: 429, retryAfter: '2' });
  });
});
