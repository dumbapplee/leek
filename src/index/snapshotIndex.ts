import type { LookupResult, ProductContext } from '../domain/productContext.js';
import { contextKeyText } from '../domain/stockKey.js';
import { fetchCountrySnapshot, type EnrichFn } from '../clients/productContextClient.js';
import { failureReason, type HttpDeps } from '../clients/httpJson.js';

type CountryIndex = { ok: true; contexts: Map<string, ProductContext> } | { ok: false; reason: string };

export function createSnapshotLookup(deps: HttpDeps): EnrichFn {
  const indexes = new Map<string, Promise<CountryIndex>>();

  function indexFor(countryCode: string): Promise<CountryIndex> {
    let index = indexes.get(countryCode);
    if (!index) {
      index = loadIndex(deps, countryCode).then((result) => {
        if (!result.ok) {
          indexes.delete(countryCode);
        }
        return result;
      });
      indexes.set(countryCode, index);
    }
    return index;
  }

  return async (productId, sizeId, countryCode): Promise<LookupResult> => {
    const index = await indexFor(countryCode);
    if (!index.ok) {
      return { kind: 'failed', retryable: true, reason: index.reason };
    }
    const context = index.contexts.get(contextKeyText(productId, sizeId, countryCode));
    return context ? { kind: 'found', context } : { kind: 'not_found' };
  };
}

async function loadIndex(deps: HttpDeps, countryCode: string): Promise<CountryIndex> {
  try {
    return { ok: true, contexts: await fetchCountrySnapshot(deps, countryCode) };
  } catch (error) {
    return { ok: false, reason: `snapshot unavailable: ${failureReason(error)}` };
  }
}
