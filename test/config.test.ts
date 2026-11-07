import { describe, expect, it } from 'vitest';
import { type Config, loadConfig } from '../src/config.js';

const defaults: Config = {
  port: 3000,
  productContextBaseUrl: 'http://127.0.0.1:8080',
  availabilityBaseUrl: 'http://127.0.0.1:8080',
  eventSinkBaseUrl: 'http://127.0.0.1:8080',
  dbPath: './data/processor.db',
  concurrency: 8,
  chunkSize: 500,
  retryMaxAttempts: 5,
  retryBaseMs: 200,
  retryMaxMs: 5000,
  outboxMaxAttempts: 10,
  leaseTtlMs: 30000,
  httpTimeoutMs: 5000,
  enableDevRoutes: true,
};

const variableFields: Array<[string, keyof Config]> = [
  ['PORT', 'port'],
  ['PRODUCT_CONTEXT_BASE_URL', 'productContextBaseUrl'],
  ['AVAILABILITY_BASE_URL', 'availabilityBaseUrl'],
  ['DB_PATH', 'dbPath'],
  ['CONCURRENCY', 'concurrency'],
  ['CHUNK_SIZE', 'chunkSize'],
  ['RETRY_MAX_ATTEMPTS', 'retryMaxAttempts'],
  ['RETRY_BASE_MS', 'retryBaseMs'],
  ['RETRY_MAX_MS', 'retryMaxMs'],
  ['OUTBOX_MAX_ATTEMPTS', 'outboxMaxAttempts'],
  ['LEASE_TTL_MS', 'leaseTtlMs'],
  ['HTTP_TIMEOUT_MS', 'httpTimeoutMs'],
];

const numericVariables = [
  'PORT',
  'CONCURRENCY',
  'CHUNK_SIZE',
  'RETRY_MAX_ATTEMPTS',
  'RETRY_BASE_MS',
  'RETRY_MAX_MS',
  'OUTBOX_MAX_ATTEMPTS',
  'LEASE_TTL_MS',
  'HTTP_TIMEOUT_MS',
];

const overrides: Array<[string, keyof Config, string, string | number]> = [
  ['PORT', 'port', '8081', 8081],
  ['PRODUCT_CONTEXT_BASE_URL', 'productContextBaseUrl', 'http://127.0.0.1:9001', 'http://127.0.0.1:9001'],
  ['AVAILABILITY_BASE_URL', 'availabilityBaseUrl', 'http://127.0.0.1:9002', 'http://127.0.0.1:9002'],
  ['DB_PATH', 'dbPath', './tmp/test.db', './tmp/test.db'],
  ['CONCURRENCY', 'concurrency', '16', 16],
  ['CHUNK_SIZE', 'chunkSize', '250', 250],
  ['RETRY_MAX_ATTEMPTS', 'retryMaxAttempts', '3', 3],
  ['RETRY_BASE_MS', 'retryBaseMs', '100', 100],
  ['RETRY_MAX_MS', 'retryMaxMs', '2000', 2000],
  ['OUTBOX_MAX_ATTEMPTS', 'outboxMaxAttempts', '4', 4],
  ['LEASE_TTL_MS', 'leaseTtlMs', '60000', 60000],
  ['HTTP_TIMEOUT_MS', 'httpTimeoutMs', '1500', 1500],
];

const malformedNumbers = ['-1', '1.5', 'abc', '3000abc', ' 8', '8 ', '+8', '1e3'];

describe('loadConfig defaults', () => {
  it('returns every default when no variables are set', () => {
    expect(loadConfig({})).toEqual(defaults);
  });

  it.each(variableFields)('uses the default for %s when it is empty', (name, field) => {
    expect(loadConfig({ [name]: '' })[field]).toBe(defaults[field]);
  });
});

describe('loadConfig environment overrides', () => {
  it.each(overrides)('reads %s from the env object', (name, field, value, expected) => {
    expect(loadConfig({ [name]: value })[field]).toBe(expected);
  });
});

describe('loadConfig numeric validation', () => {
  it.each(numericVariables)('throws an error naming %s when it is 0', (name) => {
    expect(() => loadConfig({ [name]: '0' })).toThrowError(name);
  });

  it.each(malformedNumbers)('throws an error naming CONCURRENCY when it is "%s"', (value) => {
    expect(() => loadConfig({ CONCURRENCY: value })).toThrowError('CONCURRENCY');
  });

  it('accepts PORT 65535', () => {
    expect(loadConfig({ PORT: '65535' }).port).toBe(65535);
  });

  it('throws an error naming PORT when it is 65536', () => {
    expect(() => loadConfig({ PORT: '65536' })).toThrowError('PORT');
  });

  it('reads leading zeros as the same number', () => {
    expect(loadConfig({ CONCURRENCY: '08' }).concurrency).toBe(8);
  });
});
