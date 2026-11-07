import { canonicalContext, type ProductContext } from '../domain/productContext.js';
import type { StockKey } from '../domain/stockKey.js';
import { withRetry, isRetryable } from '../infra/retry.js';
import { failureReason, sendJson, type HttpDeps } from './httpJson.js';

export type GatewayResult = { ok: true } | { ok: false; retryable: boolean; reason: string };

export interface AvailabilityWrite extends StockKey {
  availableQuantity: number;
  sourceVersion: number;
}

export async function putAvailability(
  deps: HttpDeps,
  write: AvailabilityWrite,
  context: ProductContext,
): Promise<GatewayResult> {
  const { sellerId, productId, sizeId, countryCode } = write;
  const url = `${deps.config.availabilityBaseUrl}/v1/availability/${encodeURIComponent(sellerId)}/${encodeURIComponent(productId)}/${encodeURIComponent(sizeId)}?countryCode=${encodeURIComponent(countryCode)}`;
  const body = JSON.stringify({
    availableQuantity: write.availableQuantity,
    sourceVersion: write.sourceVersion,
    productContext: canonicalContext(context),
  });
  const result = await withRetry(
    () => sendJson(deps, url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }),
    deps.config,
    deps,
  );
  if (result.ok) {
    return { ok: true };
  }
  return { ok: false, retryable: isRetryable(result.error), reason: failureReason(result.error) };
}
