export interface Config {
  countryCode: string;
  port: number;
  productContextBaseUrl: string;
  availabilityBaseUrl: string;
  dbPath: string;
  concurrency: number;
  chunkSize: number;
  retryMaxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  leaseTtlMs: number;
}

function readString(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const raw = env[name];
  return raw ? raw : fallback;
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  max?: number,
): number {
  const raw = env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  const limit = max ?? Number.MAX_SAFE_INTEGER;
  if (!/^\d+$/.test(raw) || value < 1 || value > limit) {
    const bound = max === undefined ? '' : ` no greater than ${max}`;
    throw new Error(`${name} must be a positive integer${bound}, got "${raw}"`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    countryCode: readString(env, 'COUNTRY_CODE', 'PT'),
    port: readPositiveInteger(env, 'PORT', 3000, 65535),
    productContextBaseUrl: readString(env, 'PRODUCT_CONTEXT_BASE_URL', 'http://127.0.0.1:8080'),
    availabilityBaseUrl: readString(env, 'AVAILABILITY_BASE_URL', 'http://127.0.0.1:8080'),
    dbPath: readString(env, 'DB_PATH', './data/processor.db'),
    concurrency: readPositiveInteger(env, 'CONCURRENCY', 8),
    chunkSize: readPositiveInteger(env, 'CHUNK_SIZE', 500),
    retryMaxAttempts: readPositiveInteger(env, 'RETRY_MAX_ATTEMPTS', 5),
    retryBaseMs: readPositiveInteger(env, 'RETRY_BASE_MS', 200),
    retryMaxMs: readPositiveInteger(env, 'RETRY_MAX_MS', 5000),
    leaseTtlMs: readPositiveInteger(env, 'LEASE_TTL_MS', 30000),
  };
}
