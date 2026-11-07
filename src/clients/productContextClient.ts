import { contextKeyText } from '../domain/stockKey.js';
import { parseProductContext, type LookupResult, type ProductContext } from '../domain/productContext.js';
import { withRetry, isRetryable } from '../infra/retry.js';
import { failureReason, isNotFound, sendJson, type HttpDeps } from './httpJson.js';

export type EnrichFn = (productId: string, sizeId: string, countryCode: string) => Promise<LookupResult>;

export async function lookupProductContext(
  deps: HttpDeps,
  productId: string,
  sizeId: string,
  countryCode: string,
): Promise<LookupResult> {
  const url = `${deps.config.productContextBaseUrl}/v1/products/${encodeURIComponent(productId)}/sizes/${encodeURIComponent(sizeId)}?countryCode=${encodeURIComponent(countryCode)}`;
  const result = await withRetry(() => sendJson(deps, url, { method: 'GET' }), deps.config, deps);
  if (result.ok) {
    const context = parseProductContext(result.value.body);
    return context
      ? { kind: 'found', context }
      : { kind: 'failed', retryable: false, reason: 'invalid product context response' };
  }
  if (isNotFound(result.error)) {
    return { kind: 'not_found' };
  }
  return { kind: 'failed', retryable: isRetryable(result.error), reason: failureReason(result.error) };
}

export async function fetchCountrySnapshot(deps: HttpDeps, countryCode: string): Promise<Map<string, ProductContext>> {
  const url = `${deps.config.productContextBaseUrl}/v1/product-contexts/snapshot?countryCode=${encodeURIComponent(countryCode)}`;
  const result = await withRetry(() => sendJson(deps, url, { method: 'GET' }), deps.config, deps);
  if (!result.ok) {
    throw result.error;
  }
  if (!Array.isArray(result.value.body)) {
    throw new Error('invalid snapshot response');
  }
  const contexts = new Map<string, ProductContext>();
  for (const item of result.value.body) {
    const context = parseProductContext(item);
    if (context) {
      contexts.set(contextKeyText(context.productId, context.sizeId, context.countryCode), context);
    }
  }
  return contexts;
}
