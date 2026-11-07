import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type ValidationError,
  validateCsvHeader,
  validateCsvRow,
  validateSellerInventoryChanged,
} from '../src/domain/validation.js';

const sampleEvent: Record<string, unknown> = JSON.parse(
  readFileSync(new URL('../wiremock/__files/sample-event.json', import.meta.url), 'utf8'),
);

const eventFields = [
  'eventId',
  'eventType',
  'schemaVersion',
  'occurredAt',
  'sellerId',
  'productId',
  'sizeId',
  'countryCode',
  'availableQuantity',
  'sourceVersion',
];

const stringEventFields = ['eventId', 'sellerId', 'productId', 'sizeId'];
const stringCsvColumns = ['sellerId', 'productId', 'sizeId'];
const csvColumns = ['sellerId', 'productId', 'sizeId', 'countryCode', 'availableQuantity', 'sourceVersion'];
const validRow = ['seller-001', 'style-1', 'size-34', 'PT', '0', '1'];
const validRowValue = {
  sellerId: 'seller-001',
  productId: 'style-1',
  sizeId: 'size-34',
  countryCode: 'PT',
  availableQuantity: 0,
  sourceVersion: 1,
};
const badIntegerCells = ['-1', '1.5', '1e3', ' 3', '3 ', '+3', '', 'abc', '9007199254740992'];
const anyReason = expect.stringMatching(/\S/);

function withEventFields(changes: Record<string, unknown>): Record<string, unknown> {
  return { ...sampleEvent, ...changes };
}

function withoutEventField(field: string): Record<string, unknown> {
  const event = { ...sampleEvent };
  delete event[field];
  return event;
}

function rowWith(changes: Partial<Record<string, string>>): string[] {
  return csvColumns.map((column, index) => changes[column] ?? validRow[index]);
}

function asCells(value: unknown): string[] {
  return value as string[];
}

function failureAt(field: string, line: number) {
  return { ok: false, errors: [{ field, reason: anyReason, line }] };
}

function errorsOf(result: { ok: boolean; errors?: ValidationError[] }): ValidationError[] {
  expect(result.ok).toBe(false);
  return result.errors ?? [];
}

function failedFields(result: { ok: boolean; errors?: ValidationError[] }): string[] {
  return errorsOf(result)
    .map((error) => error.field)
    .sort();
}

describe('validateSellerInventoryChanged', () => {
  it('accepts the sample event from sample-event.json', () => {
    expect(validateSellerInventoryChanged(sampleEvent)).toEqual({ ok: true, value: sampleEvent });
  });

  it.each(eventFields)('rejects an event without %s', (field) => {
    expect(failedFields(validateSellerInventoryChanged(withoutEventField(field)))).toEqual([field]);
  });

  it.each(['sellerinventorychanged', 'OtherEvent'])('rejects eventType %s', (eventType) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ eventType })))).toEqual(['eventType']);
  });

  it.each([2, 0, '1', 1.5])('rejects schemaVersion %j', (schemaVersion) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ schemaVersion })))).toEqual([
      'schemaVersion',
    ]);
  });

  it('accepts PT as a known ISO 3166-1 alpha-2 countryCode', () => {
    const event = withEventFields({ countryCode: 'PT' });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  it.each(['XX', 'ZZ'])('rejects countryCode %j that is not assigned in ISO 3166-1', (countryCode) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode })))).toEqual([
      'countryCode',
    ]);
  });

  it.each(['pt', 'Pt'])('rejects lowercase countryCode %j', (countryCode) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode })))).toEqual([
      'countryCode',
    ]);
  });

  it('rejects a three-letter countryCode', () => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode: 'PTT' })))).toEqual([
      'countryCode',
    ]);
  });

  it('rejects an empty countryCode', () => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode: '' })))).toEqual([
      'countryCode',
    ]);
  });

  it.each(['P', 'P1', 'PT '])('rejects malformed countryCode %j', (countryCode) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode })))).toEqual([
      'countryCode',
    ]);
  });

  it.each([5, null, ['PT']])('rejects non-string countryCode %j', (countryCode) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ countryCode })))).toEqual([
      'countryCode',
    ]);
  });

  it.each([-1, 1.5, '3', NaN, Infinity, 2 ** 53])('rejects availableQuantity %s', (availableQuantity) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ availableQuantity })))).toEqual([
      'availableQuantity',
    ]);
  });

  it.each([0, 2 ** 53 - 1])('accepts availableQuantity %s', (availableQuantity) => {
    const event = withEventFields({ availableQuantity });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  it.each([-1, 1.5, '7', NaN, Infinity, 2 ** 53])('rejects sourceVersion %s', (sourceVersion) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ sourceVersion })))).toEqual([
      'sourceVersion',
    ]);
  });

  it.each([0, 2 ** 53 - 1])('accepts sourceVersion %s', (sourceVersion) => {
    const event = withEventFields({ sourceVersion });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  it('keeps an untrimmed sellerId as given', () => {
    const event = withEventFields({ sellerId: ' boutique-42 ' });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  const invalidStringCases: Array<[string, unknown]> = stringEventFields.flatMap(
    (field): Array<[string, unknown]> => [
      [field, ''],
      [field, '   '],
      [field, 5],
      [field, null],
    ],
  );

  it.each(invalidStringCases)('rejects %s set to %j', (field, value) => {
    expect(failedFields(validateSellerInventoryChanged(withEventFields({ [field]: value })))).toEqual([field]);
  });

  it.each(['2026-10-20T08:00:00Z', '2026-10-20T08:00:00.123Z', '2026-10-20T08:00:00+01:00', '2026-10-20T08:00:00-05:00'])(
    'accepts occurredAt %s',
    (occurredAt) => {
      const event = withEventFields({ occurredAt });

      expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
    },
  );

  it.each(['not-a-date', '2026-10-20', '2026-02-30T00:00:00Z', '2026-10-20T08:00:00'])(
    'rejects occurredAt %s',
    (occurredAt) => {
      expect(failedFields(validateSellerInventoryChanged(withEventFields({ occurredAt })))).toEqual(['occurredAt']);
    },
  );

  it.each<[string, unknown]>([
    ['eventId', 'fault-429'],
    ['eventId', 'fault-503'],
    ['productId', 'style-90001'],
    ['productId', 'style-9999'],
    ['sellerId', 'seller-429'],
    ['sellerId', 'seller-503'],
  ])('accepts fault input %s set to %j', (field, value) => {
    const event = withEventFields({ [field]: value });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  it('ignores keys outside the ten fields', () => {
    const event = withEventFields({ extra: 1 });

    expect(validateSellerInventoryChanged(event)).toEqual({ ok: true, value: event });
  });

  it('reports one error for each of three bad fields', () => {
    const event = withEventFields({ countryCode: 'pt', availableQuantity: -1, sourceVersion: 1.5 });

    expect(failedFields(validateSellerInventoryChanged(event))).toEqual([
      'availableQuantity',
      'countryCode',
      'sourceVersion',
    ]);
  });

  it('gives each event error a field name and a non-empty reason', () => {
    const event = withEventFields({ countryCode: 'pt', availableQuantity: -1, sourceVersion: 1.5 });
    const errors = errorsOf(validateSellerInventoryChanged(event));

    expect(errors).toHaveLength(3);
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: 'countryCode', reason: anyReason },
        { field: 'availableQuantity', reason: anyReason },
        { field: 'sourceVersion', reason: anyReason },
      ]),
    );
  });

  it('gives event errors no line property', () => {
    const errors = errorsOf(validateSellerInventoryChanged(withEventFields({ countryCode: 'pt' })));

    expect(errors[0]).not.toHaveProperty('line');
  });

  it.each([null, undefined, 'text', 42, true, []])('rejects a non-object input %j with one event error', (input) => {
    expect(validateSellerInventoryChanged(input)).toEqual({
      ok: false,
      errors: [{ field: 'event', reason: anyReason }],
    });
  });
});

describe('validateCsvHeader', () => {
  it('accepts the header in the required column order', () => {
    expect(validateCsvHeader(csvColumns)).toEqual({ ok: true, value: null });
  });

  it('rejects swapped columns with one header error on line 1', () => {
    const swapped = [csvColumns[1], csvColumns[0], ...csvColumns.slice(2)];

    expect(validateCsvHeader(swapped)).toEqual(failureAt('header', 1));
  });

  it('rejects a header with one column missing', () => {
    expect(validateCsvHeader(csvColumns.slice(0, 5))).toEqual(failureAt('header', 1));
  });

  it('rejects a header with one extra column', () => {
    expect(validateCsvHeader([...csvColumns, 'extra'])).toEqual(failureAt('header', 1));
  });

  it.each([
    ['sellerId', ' sellerId'],
    ['sellerId', 'sellerid'],
    ['sourceVersion', 'sourceVersion\r'],
  ])('rejects the header when %s is written as %j', (column, written) => {
    const header = csvColumns.map((name) => (name === column ? written : name));

    expect(validateCsvHeader(header)).toEqual(failureAt('header', 1));
  });

  it('rejects an empty header with one header error on line 1', () => {
    expect(validateCsvHeader([])).toEqual(failureAt('header', 1));
  });

  it.each([null, undefined, 'text'])('rejects a header given as %j with one header error on line 1', (columns) => {
    expect(validateCsvHeader(asCells(columns))).toEqual(failureAt('header', 1));
  });
});

describe('validateCsvRow', () => {
  it('accepts a valid row and converts the number cells', () => {
    expect(validateCsvRow(validRow, 2)).toEqual({ ok: true, value: validRowValue });
  });

  it('accepts a valid row on line 10001', () => {
    expect(validateCsvRow(validRow, 10001)).toEqual({ ok: true, value: validRowValue });
  });

  it('converts a leading-zero quantity cell to its number', () => {
    expect(validateCsvRow(rowWith({ availableQuantity: '007' }), 2)).toEqual({
      ok: true,
      value: { ...validRowValue, availableQuantity: 7 },
    });
  });

  it.each(badIntegerCells)('rejects availableQuantity cell %j with the row line', (cell) => {
    expect(validateCsvRow(rowWith({ availableQuantity: cell }), 7)).toEqual(failureAt('availableQuantity', 7));
  });

  it.each(badIntegerCells)('rejects sourceVersion cell %j with the row line', (cell) => {
    expect(validateCsvRow(rowWith({ sourceVersion: cell }), 7)).toEqual(failureAt('sourceVersion', 7));
  });

  it.each<[string, string]>([
    ['availableQuantity', '0'],
    ['availableQuantity', '9007199254740991'],
    ['sourceVersion', '0'],
    ['sourceVersion', '9007199254740991'],
  ])('accepts %s cell %s', (column, cell) => {
    expect(validateCsvRow(rowWith({ [column]: cell }), 2)).toEqual({
      ok: true,
      value: { ...validRowValue, [column]: Number(cell) },
    });
  });

  it.each(['pt', 'P', 'PTT', '', ' PT'])('rejects countryCode cell %j with the row line', (countryCode) => {
    expect(validateCsvRow(rowWith({ countryCode }), 7)).toEqual(failureAt('countryCode', 7));
  });

  it.each(['XX', 'ZZ'])('rejects unassigned countryCode cell %j with the row line', (countryCode) => {
    expect(validateCsvRow(rowWith({ countryCode }), 7)).toEqual(failureAt('countryCode', 7));
  });

  const blankStringCases: Array<[string, string]> = stringCsvColumns.flatMap(
    (column): Array<[string, string]> => [
      [column, ''],
      [column, '  '],
    ],
  );

  it.each(blankStringCases)('rejects %s cell %j with the row line', (column, cell) => {
    expect(validateCsvRow(rowWith({ [column]: cell }), 7)).toEqual(failureAt(column, 7));
  });

  it('reports both bad cells of one row with the row line', () => {
    const result = validateCsvRow(rowWith({ countryCode: 'pt', availableQuantity: '-1' }), 7);

    expect(errorsOf(result)).toHaveLength(2);
    expect(errorsOf(result)).toEqual(
      expect.arrayContaining([
        { field: 'countryCode', reason: anyReason, line: 7 },
        { field: 'availableQuantity', reason: anyReason, line: 7 },
      ]),
    );
  });

  it('rejects an empty row with one row error', () => {
    expect(validateCsvRow([], 7)).toEqual(failureAt('row', 7));
  });

  it('rejects a row with five cells with one row error', () => {
    expect(validateCsvRow(validRow.slice(0, 5), 7)).toEqual(failureAt('row', 7));
  });

  it('rejects a row with seven cells with one row error', () => {
    expect(validateCsvRow([...validRow, 'extra'], 7)).toEqual(failureAt('row', 7));
  });

  it.each([null, undefined, 'text'])('rejects cells given as %j with one row error', (cells) => {
    expect(validateCsvRow(asCells(cells), 7)).toEqual(failureAt('row', 7));
  });

  it.each([2, 10001])('reports line %s on a bad row', (lineNumber) => {
    expect(validateCsvRow(rowWith({ countryCode: 'pt' }), lineNumber)).toEqual(
      failureAt('countryCode', lineNumber),
    );
  });

  it.each([1, 0, 1.5])('reports the line number as given: %s', (lineNumber) => {
    expect(validateCsvRow(rowWith({ countryCode: 'pt' }), lineNumber)).toEqual(
      failureAt('countryCode', lineNumber),
    );
  });

  it('accepts a fault-input row from the mocks', () => {
    expect(validateCsvRow(['seller-429', 'style-90001', 'size-38', 'PT', '3', '7'], 2)).toEqual({
      ok: true,
      value: {
        sellerId: 'seller-429',
        productId: 'style-90001',
        sizeId: 'size-38',
        countryCode: 'PT',
        availableQuantity: 3,
        sourceVersion: 7,
      },
    });
  });
});
