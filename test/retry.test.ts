import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Config, loadConfig } from '../src/config.js';
import { type RetryResult, withRetry } from '../src/infra/retry.js';

interface FakeClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  waits: number[];
}

type Step = { error: unknown } | { value: string };

const config = loadConfig({});
const jitterRuns = 100;
const timerLimitMs = 2147483647;

const retryAfterFloorRows = [
  { retryAfter: '5', seconds: 5 },
  { retryAfter: '05', seconds: 5 },
  { retryAfter: ' 5', seconds: 5 },
];

const ignoredRetryAfters = [
  '+5',
  '5.0',
  '1.5',
  '-1',
  '',
  'abc',
  'Wed, 21 Oct 2015 07:28:00 GMT',
  '9007199254740991',
  '9007199254740992',
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function pinRandom(value: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

function fakeClock(): FakeClock {
  let elapsedMs = 0;
  const waits: number[] = [];
  return {
    now: () => elapsedMs,
    sleep: async (ms) => {
      waits.push(ms);
      elapsedMs += ms;
    },
    waits,
  };
}

function httpError(status: number, retryAfter?: string): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, retryAfter });
}

function withNetworkCode(error: Error, code: string): Error {
  return Object.assign(error, { cause: { code } });
}

function networkError(code: string): Error {
  return withNetworkCode(new TypeError('fetch failed'), code);
}

function withName(error: Error, name: string): Error {
  return Object.assign(error, { name });
}

function timeoutError(): Error {
  return withName(new Error('the request timed out'), 'TimeoutError');
}

function abortError(): Error {
  return withName(new Error('the operation was aborted'), 'AbortError');
}

function domainRejection(): Error {
  return new Error('product style-9999 is inactive');
}

function scripted(steps: Step[], clock: FakeClock) {
  const startedAt: number[] = [];
  const argCounts: number[] = [];
  const operation = async (...args: unknown[]): Promise<string> => {
    const step = steps[startedAt.length];
    startedAt.push(clock.now());
    argCounts.push(args.length);
    if (step === undefined) {
      throw new Error('operation called more times than scripted');
    }
    if ('error' in step) {
      throw step.error;
    }
    return step.value;
  };
  return { operation, startedAt, argCounts };
}

function failures(error: unknown, count: number): Step[] {
  return Array.from({ length: count }, () => ({ error }));
}

async function runOperation(steps: Step[], policy: Config = config) {
  const clock = fakeClock();
  const { operation, startedAt, argCounts } = scripted(steps, clock);
  const result = await withRetry(operation, policy, { sleep: clock.sleep });
  return { result, waits: clock.waits, startedAt, argCounts };
}

function expectFailure(result: RetryResult<unknown>, error: unknown): void {
  expect(result.ok).toBe(false);
  expect(result.ok ? undefined : result.error).toBe(error);
}

async function expectTerminal(error: unknown): Promise<void> {
  const { result, startedAt, waits } = await runOperation([{ error }, { value: 'ok' }]);
  expect(startedAt).toHaveLength(1);
  expect(waits).toEqual([]);
  expectFailure(result, error);
}

async function alwaysFails503(): Promise<string> {
  throw httpError(503);
}

function jitterCeiling(policy: Config, retry: number): number {
  return Math.min(policy.retryMaxMs, policy.retryBaseMs * 2 ** (retry - 1));
}

async function collectRetryWaits(
  policy: Config,
  runs: number,
): Promise<Array<{ retry: number; wait: number }>> {
  const samples: Array<{ retry: number; wait: number }> = [];
  for (let run = 0; run < runs; run += 1) {
    const clock = fakeClock();
    await withRetry(alwaysFails503, policy, { sleep: clock.sleep });
    clock.waits.forEach((wait, index) => samples.push({ retry: index + 1, wait }));
  }
  return samples;
}

const retryableErrors = [
  { label: 'HTTP 429', makeError: () => httpError(429) },
  { label: 'HTTP 502', makeError: () => httpError(502) },
  { label: 'HTTP 503', makeError: () => httpError(503) },
  { label: 'HTTP 504', makeError: () => httpError(504) },
  { label: 'network code ECONNRESET', makeError: () => networkError('ECONNRESET') },
  { label: 'network code ECONNREFUSED', makeError: () => networkError('ECONNREFUSED') },
  { label: 'network code ETIMEDOUT', makeError: () => networkError('ETIMEDOUT') },
  { label: 'network code EAI_AGAIN', makeError: () => networkError('EAI_AGAIN') },
  { label: 'network code EPIPE', makeError: () => networkError('EPIPE') },
  { label: 'TimeoutError', makeError: timeoutError },
];

describe('withRetry error classification', () => {
  it.each(retryableErrors)('retries $label and returns the later success', async ({ makeError }) => {
    const { result, startedAt } = await runOperation([{ error: makeError() }, { value: 'ok' }]);
    expect(startedAt).toHaveLength(2);
    expect(result).toStrictEqual({ ok: true, value: 'ok' });
  });

  it.each([400, 404, 408, 409, 422, 500, 501, 505])('does not retry HTTP %i', async (status) => {
    await expectTerminal(httpError(status));
  });

  it.each(['ENOTFOUND', 'ECONNABORTED'])('does not retry network code %s', async (code) => {
    await expectTerminal(networkError(code));
  });

  it('does not retry an AbortError', async () => {
    await expectTerminal(abortError());
  });

  it('does not retry a domain rejection', async () => {
    await expectTerminal(domainRejection());
  });

  it.each([
    { label: 'a string', rejection: 'product rejected' },
    { label: 'null', rejection: null },
    { label: 'undefined', rejection: undefined },
  ])('does not retry a rejection with $label and does not throw', async ({ rejection }) => {
    await expectTerminal(rejection);
  });

  it('does not retry a 404 with an ECONNRESET code because the status decides', async () => {
    await expectTerminal(withNetworkCode(httpError(404), 'ECONNRESET'));
  });

  it('retries a 503 with an ENOTFOUND code because the status decides', async () => {
    const { result, startedAt } = await runOperation([
      { error: withNetworkCode(httpError(503), 'ENOTFOUND') },
      { value: 'ok' },
    ]);
    expect(startedAt).toHaveLength(2);
    expect(result).toStrictEqual({ ok: true, value: 'ok' });
  });

  it('does not retry a 404 with a TimeoutError name because the status decides', async () => {
    await expectTerminal(withName(httpError(404), 'TimeoutError'));
  });

  it('stops retrying at a 404 that follows a 503 and returns the 404', async () => {
    const notFound = httpError(404);
    const { result, startedAt, waits } = await runOperation([
      { error: httpError(503) },
      { error: notFound },
      { value: 'ok' },
    ]);
    expect(startedAt).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expectFailure(result, notFound);
  });
});

describe('withRetry Retry-After', () => {
  it.each(retryAfterFloorRows)(
    'waits at least the Retry-After floor for "$retryAfter"',
    async ({ retryAfter, seconds }) => {
      const { waits } = await runOperation([{ error: httpError(429, retryAfter) }, { value: 'ok' }]);
      expect(waits).toHaveLength(1);
      expect(waits[0]).toBeGreaterThanOrEqual(seconds * 1000);
    },
  );

  it('trims a tab around Retry-After before reading it', async () => {
    const { waits } = await runOperation([{ error: httpError(429, '\t5\t') }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(5000);
  });

  it('gives no floor for Retry-After "0"', async () => {
    const { waits } = await runOperation([{ error: httpError(429, '0') }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });

  it.each(ignoredRetryAfters)('ignores Retry-After %j and waits only the jittered delay', async (retryAfter) => {
    const { waits } = await runOperation([{ error: httpError(429, retryAfter) }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });

  it('ignores Retry-After "2147484" because its ms value is above the timer limit and waits only the jittered delay', async () => {
    const { waits } = await runOperation([{ error: httpError(429, '2147484') }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });

  it('honours Retry-After "2147483" because its ms value is at the timer limit and waits at least 2147483000 ms', async () => {
    const { waits } = await runOperation([{ error: httpError(429, '2147483') }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(2147483000);
  });

  it('does not cap the Retry-After floor at RETRY_MAX_MS', async () => {
    const policy = loadConfig({ RETRY_MAX_MS: '5000' });
    const { waits } = await runOperation([{ error: httpError(429, '10') }, { value: 'ok' }], policy);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(10000);
  });

  it('ignores Retry-After on a 503', async () => {
    const { waits } = await runOperation([{ error: httpError(503, '5') }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });

  it('applies no floor to a 429 without Retry-After', async () => {
    const { waits } = await runOperation([{ error: httpError(429) }, { value: 'ok' }]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });
});

describe('withRetry max attempts', () => {
  it('calls the operation RETRY_MAX_ATTEMPTS times when every attempt is retryable', async () => {
    const { startedAt } = await runOperation(failures(httpError(503), config.retryMaxAttempts));
    expect(startedAt).toHaveLength(config.retryMaxAttempts);
  });

  it('returns the last retryable error as a failure instead of throwing', async () => {
    const lastError = httpError(503);
    const { result } = await runOperation([
      ...failures(httpError(429), config.retryMaxAttempts - 1),
      { error: lastError },
    ]);
    expectFailure(result, lastError);
  });

  it('reads the attempt limit from RETRY_MAX_ATTEMPTS', async () => {
    const policy = loadConfig({ RETRY_MAX_ATTEMPTS: '3' });
    const { startedAt } = await runOperation(failures(httpError(503), policy.retryMaxAttempts), policy);
    expect(startedAt).toHaveLength(3);
  });

  it('makes one attempt and returns the error when RETRY_MAX_ATTEMPTS is 1', async () => {
    const policy = loadConfig({ RETRY_MAX_ATTEMPTS: '1' });
    const retryable = httpError(503);
    const { result, startedAt, waits } = await runOperation([{ error: retryable }, { value: 'ok' }], policy);
    expect(startedAt).toHaveLength(1);
    expect(waits).toEqual([]);
    expectFailure(result, retryable);
  });
});

describe('withRetry configuration', () => {
  it('ignores RETRY_MAX_ATTEMPTS in the environment and uses the config argument', async () => {
    vi.stubEnv('RETRY_MAX_ATTEMPTS', '1');
    const { startedAt } = await runOperation(failures(httpError(503), config.retryMaxAttempts));
    expect(startedAt).toHaveLength(config.retryMaxAttempts);
  });

  it('ignores every RETRY_* environment variable and keeps the first wait within config.retryBaseMs', async () => {
    pinRandom(0.999);
    vi.stubEnv('RETRY_MAX_ATTEMPTS', '1');
    vi.stubEnv('RETRY_BASE_MS', '1000000');
    vi.stubEnv('RETRY_MAX_MS', '100');
    expect(loadConfig().retryBaseMs).toBe(1000000);
    expect(loadConfig().retryMaxMs).toBe(100);
    const { startedAt, waits } = await runOperation([{ error: httpError(503) }, { value: 'ok' }]);
    expect(startedAt).toHaveLength(2);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(100);
    expect(waits[0]).toBeLessThanOrEqual(config.retryBaseMs);
  });
});

describe('withRetry waits and operation calls', () => {
  it('passes the retry wait to the injected sleep in milliseconds', async () => {
    const { waits } = await runOperation([{ error: httpError(429, '1') }, { value: 'ok' }]);
    expect(waits).toEqual([1000]);
  });

  it('does not sleep after the final failed attempt', async () => {
    const { waits } = await runOperation(failures(httpError(503), config.retryMaxAttempts));
    expect(waits).toHaveLength(config.retryMaxAttempts - 1);
  });

  it('does not sleep when the first attempt succeeds', async () => {
    const { result, waits } = await runOperation([{ value: 'ok' }]);
    expect(result).toStrictEqual({ ok: true, value: 'ok' });
    expect(waits).toEqual([]);
  });

  it('calls the operation with no arguments on every attempt', async () => {
    const { argCounts } = await runOperation([{ error: httpError(503) }, { value: 'ok' }]);
    expect(argCounts).toEqual([0, 0]);
  });
});

describe('withRetry full jitter', () => {
  it('keeps every retry wait between 0 and the exponential ceiling for its retry', async () => {
    const samples = await collectRetryWaits(config, jitterRuns);
    expect(samples).toHaveLength(jitterRuns * (config.retryMaxAttempts - 1));
    const outOfBounds = samples.filter(
      ({ retry, wait }) => wait < 0 || wait > jitterCeiling(config, retry),
    );
    expect(outOfBounds).toEqual([]);
  });

  it('caps every retry wait at RETRY_MAX_MS', async () => {
    const policy = loadConfig({ RETRY_MAX_ATTEMPTS: '10', RETRY_MAX_MS: '1000' });
    const samples = await collectRetryWaits(policy, jitterRuns);
    expect(samples.filter(({ wait }) => wait > policy.retryMaxMs)).toEqual([]);
  });

  it('caps the first retry wait at RETRY_MAX_MS when RETRY_BASE_MS is above it', async () => {
    pinRandom(0.999);
    const policy = loadConfig({ RETRY_BASE_MS: '10000', RETRY_MAX_MS: '5000' });
    const { waits } = await runOperation([{ error: httpError(503) }, { value: 'ok' }], policy);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeLessThanOrEqual(5000);
  });

  it('clamps every sleep delay to 2147483647 ms when RETRY_MAX_MS is above the timer limit', async () => {
    pinRandom(0.999);
    const policy = loadConfig({ RETRY_MAX_ATTEMPTS: '26', RETRY_MAX_MS: '3000000000' });
    const { waits } = await runOperation([...failures(httpError(503), 25), { value: 'ok' }], policy);
    expect(waits).toHaveLength(25);
    expect(waits.filter((wait) => wait > timerLimitMs)).toEqual([]);
  });

  it('spreads retry waits below their ceiling instead of always using it', async () => {
    const samples = await collectRetryWaits(config, jitterRuns);
    expect(samples.some(({ retry, wait }) => wait < jitterCeiling(config, retry))).toBe(true);
  });
});
