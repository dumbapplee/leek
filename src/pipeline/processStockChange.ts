import type { ProductContext } from '../domain/productContext.js';
import { buildSizeAvailabilityUpdated } from '../domain/sizeAvailabilityUpdated.js';
import { stockKeyText, type StockKey } from '../domain/stockKey.js';
import { putAvailability } from '../clients/availabilityClient.js';
import type { EnrichFn } from '../clients/productContextClient.js';
import { failureReason, type HttpDeps } from '../clients/httpJson.js';
import type { Db } from '../infra/db.js';
import { enqueueEvent } from '../outbox/outboxPublisher.js';
import { acquireLease, keepLeaseAlive, releaseLease, type HeldLease } from './keyLease.js';
import type { VersionStore } from '../stores/versionStore.js';
import { isRetryable } from '../infra/retry.js';

export interface StockChange extends StockKey {
  availableQuantity: number;
  sourceVersion: number;
}

export type ChangeResult =
  | { kind: 'APPLIED' }
  | { kind: 'SKIPPED_STALE' }
  | { kind: 'REJECTED'; reason: string }
  | { kind: 'FAILED'; retryable: boolean; reason: string };

const LEASE_LOST: ChangeResult = { kind: 'FAILED', retryable: true, reason: 'stock lease lost' };

export interface PipelineDeps {
  db: Db;
  versions: VersionStore;
  http: HttpDeps;
  enrich: EnrichFn;
  now: () => number;
}

export async function processStockChange(deps: PipelineDeps, change: StockChange): Promise<ChangeResult> {
  try {
    return await run(deps, change);
  } catch (error) {
    return { kind: 'FAILED', retryable: isRetryable(error), reason: failureReason(error) };
  }
}

async function run(deps: PipelineDeps, change: StockChange): Promise<ChangeResult> {
  if (isNotNewer(deps, change)) {
    return { kind: 'SKIPPED_STALE' };
  }
  const lookup = await deps.enrich(change.productId, change.sizeId, change.countryCode);
  if (lookup.kind === 'not_found') {
    return { kind: 'REJECTED', reason: 'product context not found' };
  }
  if (lookup.kind === 'failed') {
    return { kind: 'FAILED', retryable: lookup.retryable, reason: lookup.reason };
  }
  const rejection = rejectionFor(lookup.context);
  if (rejection) {
    return { kind: 'REJECTED', reason: rejection };
  }
  return withLease(deps, change, lookup.context);
}

async function withLease(deps: PipelineDeps, change: StockChange, context: ProductContext): Promise<ChangeResult> {
  const key = stockKeyText(change);
  const ttlMs = deps.http.config.leaseTtlMs;
  const owner = await acquireLease(deps.db, key, ttlMs, {
    now: deps.now,
    sleep: deps.http.sleep,
  });
  if (owner === undefined) {
    return { kind: 'FAILED', retryable: true, reason: 'stock key is busy' };
  }
  const lease = keepLeaseAlive(deps.db, key, owner, ttlMs, deps.now);
  try {
    return await applyUnderLease(deps, change, context, lease);
  } finally {
    lease.stop();
    releaseLease(deps.db, key, owner);
  }
}

async function applyUnderLease(
  deps: PipelineDeps,
  change: StockChange,
  context: ProductContext,
  lease: HeldLease,
): Promise<ChangeResult> {
  if (isNotNewer(deps, change)) {
    return { kind: 'SKIPPED_STALE' };
  }
  if (!lease.isHeld()) {
    return LEASE_LOST;
  }
  const write = await putAvailability(deps.http, change, context);
  if (!write.ok) {
    return { kind: 'FAILED', retryable: write.retryable, reason: write.reason };
  }
  return commit(deps, change, context, lease);
}

function commit(deps: PipelineDeps, change: StockChange, context: ProductContext, lease: HeldLease): ChangeResult {
  return deps.db.transaction((): ChangeResult => {
    if (!lease.isHeld()) {
      return LEASE_LOST;
    }
    if (deps.versions.tryApply(change, change.sourceVersion) === 'STALE') {
      return { kind: 'SKIPPED_STALE' };
    }
    const occurredAt = new Date(deps.now()).toISOString();
    enqueueEvent(
      deps.db,
      change,
      buildSizeAvailabilityUpdated(change, change.availableQuantity, change.sourceVersion, context, occurredAt),
    );
    return { kind: 'APPLIED' };
  })();
}

function isNotNewer(deps: PipelineDeps, change: StockChange): boolean {
  const applied = deps.versions.readApplied(change);
  return applied !== undefined && applied >= change.sourceVersion;
}

function rejectionFor(context: ProductContext): string | undefined {
  if (context.productStatus !== 'ACTIVE') {
    return 'product is not active';
  }
  if (!context.countryEnabled) {
    return 'product is not enabled in country';
  }
  return undefined;
}
