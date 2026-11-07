import { iso3166Alpha2 } from './countryCodes.js';

export interface ValidationError {
  field: string;
  reason: string;
  line?: number;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

export interface SellerInventoryChanged {
  eventId: string;
  eventType: 'SellerInventoryChanged';
  schemaVersion: 1;
  occurredAt: string;
  sellerId: string;
  productId: string;
  sizeId: string;
  countryCode: string;
  availableQuantity: number;
  sourceVersion: number;
}

export interface SellerInventoryRow {
  sellerId: string;
  productId: string;
  sizeId: string;
  countryCode: string;
  availableQuantity: number;
  sourceVersion: number;
}

interface Check {
  isValid: (value: unknown) => boolean;
  reason: string;
}

const csvColumns = ['sellerId', 'productId', 'sizeId', 'countryCode', 'availableQuantity', 'sourceVersion'] as const;
type CsvColumn = (typeof csvColumns)[number];

const isoDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const textCheck: Check = {
  isValid: (value) => typeof value === 'string' && value.trim() !== '',
  reason: 'must be a non-empty string',
};

const countryCodeCheck: Check = {
  isValid: (value) => typeof value === 'string' && iso3166Alpha2.has(value),
  reason: 'must be an ISO 3166-1 alpha-2 code',
};

const wholeNumberCheck: Check = {
  isValid: (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  reason: 'must be a whole number from 0',
};

const digitsCheck: Check = {
  isValid: (value) => typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)),
  reason: 'must be a whole number from 0',
};

const eventChecks: Record<keyof SellerInventoryChanged, Check> = {
  eventId: textCheck,
  eventType: { isValid: (value) => value === 'SellerInventoryChanged', reason: 'must be SellerInventoryChanged' },
  schemaVersion: { isValid: (value) => value === 1, reason: 'must be 1' },
  occurredAt: { isValid: isIsoDateTime, reason: 'must be an ISO 8601 date-time with a zone' },
  sellerId: textCheck,
  productId: textCheck,
  sizeId: textCheck,
  countryCode: countryCodeCheck,
  availableQuantity: wholeNumberCheck,
  sourceVersion: wholeNumberCheck,
};

const csvChecks: Record<CsvColumn, Check> = {
  sellerId: textCheck,
  productId: textCheck,
  sizeId: textCheck,
  countryCode: countryCodeCheck,
  availableQuantity: digitsCheck,
  sourceVersion: digitsCheck,
};

export function validateSellerInventoryChanged(event: unknown): ValidationResult<SellerInventoryChanged> {
  if (!isRecord(event)) {
    return { ok: false, errors: [{ field: 'event', reason: 'must be an object' }] };
  }
  const errors = Object.entries(eventChecks).flatMap(([field, check]) =>
    check.isValid(event[field]) ? [] : [{ field, reason: check.reason }],
  );
  return errors.length === 0 ? { ok: true, value: event as unknown as SellerInventoryChanged } : { ok: false, errors };
}

export function validateCsvHeader(columns: string[]): ValidationResult<null> {
  const inOrder =
    Array.isArray(columns) &&
    columns.length === csvColumns.length &&
    csvColumns.every((column, index) => columns[index] === column);
  if (inOrder) {
    return { ok: true, value: null };
  }
  return { ok: false, errors: [{ field: 'header', reason: 'must list the six columns in order', line: 1 }] };
}

export function validateCsvRow(cells: string[], lineNumber: number): ValidationResult<SellerInventoryRow> {
  if (!Array.isArray(cells) || cells.length !== csvColumns.length) {
    return { ok: false, errors: [{ field: 'row', reason: 'must have six cells', line: lineNumber }] };
  }
  const errors = csvColumns.flatMap((column, index) =>
    csvChecks[column].isValid(cells[index])
      ? []
      : [{ field: column, reason: csvChecks[column].reason, line: lineNumber }],
  );
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const [sellerId, productId, sizeId, countryCode, availableQuantity, sourceVersion] = cells;
  return {
    ok: true,
    value: {
      sellerId,
      productId,
      sizeId,
      countryCode,
      availableQuantity: Number(availableQuantity),
      sourceVersion: Number(sourceVersion),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const match = isoDateTimePattern.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) {
    return false;
  }
  // Date.parse accepts day 30 in February, so the calendar fields are checked too.
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), month, day);
  return date.getUTCMonth() === month && date.getUTCDate() === day;
}
