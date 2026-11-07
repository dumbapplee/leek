export interface ProductContext {
  productId: string;
  productName: string;
  brand: { id: string; name: string };
  productStatus: string;
  sizeId: string;
  sizeLabel: string;
  sizeSystem: string;
  countryCode: string;
  countryEnabled: boolean;
}

export type LookupResult =
  | { kind: 'found'; context: ProductContext }
  | { kind: 'not_found' }
  | { kind: 'failed'; retryable: boolean; reason: string };

export function parseProductContext(value: unknown): ProductContext | null {
  if (!isRecord(value) || !isRecord(value.brand)) {
    return null;
  }
  const { brand } = value;
  const parsed = {
    productId: value.productId,
    productName: value.productName,
    brand: { id: brand.id, name: brand.name },
    productStatus: value.productStatus,
    sizeId: value.sizeId,
    sizeLabel: value.sizeLabel,
    sizeSystem: value.sizeSystem,
    countryCode: value.countryCode,
    countryEnabled: value.countryEnabled,
  };
  const valid =
    isText(parsed.productId) &&
    isText(parsed.productName) &&
    isText(brand.id) &&
    isText(brand.name) &&
    isText(parsed.productStatus) &&
    isText(parsed.sizeId) &&
    isText(parsed.sizeLabel) &&
    isText(parsed.sizeSystem) &&
    isText(parsed.countryCode) &&
    typeof parsed.countryEnabled === 'boolean';
  return valid ? (parsed as ProductContext) : null;
}

export function canonicalContext(context: ProductContext): {
  productName: string;
  brand: { id: string; name: string };
  sizeLabel: string;
  sizeSystem: string;
} {
  return {
    productName: context.productName,
    brand: context.brand,
    sizeLabel: context.sizeLabel,
    sizeSystem: context.sizeSystem,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
