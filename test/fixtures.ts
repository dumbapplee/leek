import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, vi } from 'vitest';
import { loadConfig, type Config } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createServices } from '../src/services.js';
import type { ProductContext } from '../src/domain/productContext.js';
import type { HttpDeps } from '../src/clients/httpJson.js';

export const testConfig: Config = loadConfig({
  PRODUCT_CONTEXT_BASE_URL: 'http://product-context.test',
  AVAILABILITY_BASE_URL: 'http://availability.test',
  EVENT_SINK_BASE_URL: 'http://sink.test',
  DB_PATH: ':memory:',
  CHUNK_SIZE: '2',
});

export const httpDeps: HttpDeps = {
  config: testConfig,
  sleep: async () => undefined,
};

export function context(overrides: Partial<ProductContext> = {}): ProductContext {
  return {
    productId: 'style-123',
    productName: 'Linen Shirt 123',
    brand: { id: 'brand-42', name: 'Atelier Example' },
    productStatus: 'ACTIVE',
    sizeId: 'size-38',
    sizeLabel: 'EU 38',
    sizeSystem: 'EU',
    countryCode: 'PT',
    countryEnabled: true,
    ...overrides,
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init));
}

// Captured before stubFetch replaces globalThis.fetch, so the test client still reaches the local server.
export const realFetch = globalThis.fetch;

export interface RunningApp {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startApp(overrides: Partial<Config> = {}): Promise<RunningApp> {
  const server = createApp(createServices({ ...testConfig, ...overrides })).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export function useTestApp(): (overrides?: Partial<Config>) => Promise<RunningApp> {
  const apps: RunningApp[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });
  return async (overrides) => {
    const app = await startApp(overrides);
    apps.push(app);
    return app;
  };
}
