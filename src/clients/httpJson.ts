import type { Config } from '../config.js';

export interface HttpDeps {
  config: Config;
  sleep: (ms: number) => Promise<void>;
}

export interface JsonResponse {
  status: number;
  body: unknown;
}

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendJson(deps: HttpDeps, url: string, init: RequestInit): Promise<JsonResponse> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(deps.config.httpTimeoutMs) });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpStatusError(response.status, response.headers.get('retry-after') ?? undefined);
  }
  return { status: response.status, body: text.length > 0 ? JSON.parse(text) : undefined };
}

export function isNotFound(error: unknown): boolean {
  return error instanceof HttpStatusError && error.status === 404;
}

export function failureReason(error: unknown): string {
  if (error instanceof HttpStatusError) {
    return `HTTP ${error.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown error';
}
