import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server.js';

describe('GET /health', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('responds with status 200', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
  });

  it('responds with the body {"status":"ok"}', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('responds with a JSON content type', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.headers.get('content-type')).toMatch(/application\/json/);
  });
});
