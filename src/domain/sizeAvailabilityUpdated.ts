import { canonicalContext, type ProductContext } from './productContext.js';
import { stockKeyText, type StockKey } from './stockKey.js';

export interface SizeAvailabilityUpdated {
  eventId: string;
  eventType: 'SizeAvailabilityUpdated';
  schemaVersion: 1;
  occurredAt: string;
  sellerId: string;
  productId: string;
  sizeId: string;
  countryCode: string;
  availableQuantity: number;
  sourceVersion: number;
  productContext: ReturnType<typeof canonicalContext>;
}

export function outputEventId(key: StockKey, sourceVersion: number): string {
  return `${stockKeyText(key)}|v${sourceVersion}`;
}

export function buildSizeAvailabilityUpdated(
  key: StockKey,
  availableQuantity: number,
  sourceVersion: number,
  context: ProductContext,
  occurredAt: string,
): SizeAvailabilityUpdated {
  return {
    eventId: outputEventId(key, sourceVersion),
    eventType: 'SizeAvailabilityUpdated',
    schemaVersion: 1,
    occurredAt,
    sellerId: key.sellerId,
    productId: key.productId,
    sizeId: key.sizeId,
    countryCode: key.countryCode,
    availableQuantity,
    sourceVersion,
    productContext: canonicalContext(context),
  };
}
