import type { Config } from '../config.js';

export type RetryResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

type ErrorFields = Record<string, unknown>;

const retryableStatuses = new Set([429, 502, 503, 504]);
const retryableNetworkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE']);
// Node setTimeout fires immediately above this value.
const maxTimerMs = 2147483647;

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Config,
  { sleep }: { sleep: (ms: number) => Promise<void> },
): Promise<RetryResult<T>> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (attempt >= config.retryMaxAttempts || !isRetryable(error)) {
        return { ok: false, error };
      }
      await sleep(Math.min(retryDelayMs(error, attempt, config), maxTimerMs));
    }
  }
}

export function isRetryable(error: unknown): boolean {
  const { status, name } = fieldsOf(error);
  if (typeof status === 'number') {
    return retryableStatuses.has(status);
  }
  const code = fieldsOf(fieldsOf(error).cause).code;
  return (typeof code === 'string' && retryableNetworkCodes.has(code)) || name === 'TimeoutError';
}

function retryDelayMs(error: unknown, retry: number, config: Config): number {
  const ceilingMs = Math.min(config.retryMaxMs, config.retryBaseMs * 2 ** (retry - 1));
  return Math.max(Math.random() * ceilingMs, retryAfterFloorMs(error));
}

function retryAfterFloorMs(error: unknown): number {
  const { status, retryAfter } = fieldsOf(error);
  if (status !== 429 || typeof retryAfter !== 'string') {
    return 0;
  }
  const seconds = retryAfter.trim();
  if (!/^\d+$/.test(seconds)) {
    return 0;
  }
  const ms = Number(seconds) * 1000;
  return ms <= maxTimerMs ? ms : 0;
}

function fieldsOf(value: unknown): ErrorFields {
  return typeof value === 'object' && value !== null ? (value as ErrorFields) : {};
}
