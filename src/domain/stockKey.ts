export interface StockKey {
  sellerId: string;
  productId: string;
  sizeId: string;
  countryCode: string;
}

export function stockKeyText(key: StockKey): string {
  return [key.sellerId, key.productId, key.sizeId, key.countryCode].join('|');
}

export function contextKeyText(productId: string, sizeId: string, countryCode: string): string {
  return [productId, sizeId, countryCode].join('|');
}
