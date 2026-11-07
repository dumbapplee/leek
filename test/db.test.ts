import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/infra/db.js';

type Db = ReturnType<typeof openDatabase>;

interface NamedRow {
  name: string;
}

interface ColumnInfo extends NamedRow {
  pk: number;
}

const openedDatabases: Db[] = [];
const temporaryDirectories: string[] = [];

const contractColumns: Array<[string, string[]]> = [
  ['stock_versions', ['seller_id', 'product_id', 'size_id', 'country_code', 'applied_source_version']],
  ['import_jobs', ['job_id', 'state']],
  ['import_rows', ['job_id', 'line_number', 'outcome', 'reason']],
  ['outbox', ['id', 'event_id', 'stock_key', 'payload_json', 'published_at', 'attempts', 'next_attempt_at_ms', 'last_error', 'dead_at_ms']],
  ['stock_leases', ['stock_key', 'owner', 'expires_at_ms']],
];

afterEach(() => {
  for (const db of openedDatabases.splice(0)) {
    if (db.open) {
      db.close();
    }
  }
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function open(path: string): Db {
  const db = openDatabase(path);
  openedDatabases.push(db);
  return db;
}

function openMemory(): Db {
  return open(':memory:');
}

function createTemporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'processor-db-'));
  temporaryDirectories.push(directory);
  return join(directory, 'processor.db');
}

function tableNames(db: Db): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as NamedRow[];
  return rows
    .map((row) => row.name)
    .filter((name) => !name.startsWith('sqlite_'))
    .sort();
}

function columnInfo(db: Db, table: string): ColumnInfo[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

function columnNames(db: Db, table: string): string[] {
  return columnInfo(db, table).map((column) => column.name);
}

function primaryKeyColumns(db: Db, table: string): string[] {
  return columnInfo(db, table)
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
}

function indexColumnLists(db: Db, table: string): string[][] {
  const indexes = db.prepare(`PRAGMA index_list(${table})`).all() as NamedRow[];
  return indexes.map((index) =>
    (db.prepare(`PRAGMA index_info(${index.name})`).all() as NamedRow[]).map((column) => column.name),
  );
}

function rowCount(db: Db, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function insertStockVersion(db: Db, countryCode: string): void {
  db.prepare(
    'INSERT INTO stock_versions (seller_id, product_id, size_id, country_code, applied_source_version) VALUES (?, ?, ?, ?, ?)',
  ).run('seller-1', 'product-1', 'size-1', countryCode, 1);
}

function insertJob(db: Db, jobId: string): void {
  db.prepare('INSERT INTO import_jobs (job_id, state) VALUES (?, ?)').run(jobId, 'queued');
}

function insertImportRow(db: Db, jobId: string): void {
  db.prepare('INSERT INTO import_rows (job_id, line_number, outcome, reason) VALUES (?, ?, ?, ?)').run(
    jobId,
    2,
    'accepted',
    null,
  );
}

function insertOutbox(db: Db, eventId: string): number {
  const result = db
    .prepare(
      'INSERT INTO outbox (event_id, stock_key, payload_json, published_at, attempts, last_error) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(eventId, 'seller-1:product-1:size-1:PT', '{}', null, 0, null);
  return Number(result.lastInsertRowid);
}

function insertStockLease(db: Db, stockKey: string): void {
  db.prepare('INSERT INTO stock_leases (stock_key, owner, expires_at_ms) VALUES (?, ?, ?)').run(
    stockKey,
    'worker-1',
    1700000000000,
  );
}

describe('openDatabase migrations', () => {
  it('applies the schema again without error when the same file is opened a second time', () => {
    const path = createTemporaryDatabasePath();
    open(path).close();

    expect(() => open(path)).not.toThrow();
  });

  it('keeps stock_leases rows when the schema is applied again', () => {
    const path = createTemporaryDatabasePath();
    const first = open(path);
    insertStockLease(first, 'stock-1');
    first.close();

    expect(rowCount(open(path), 'stock_leases')).toBe(1);
  });
});

describe('contract tables and columns', () => {
  it('creates exactly the five contract tables', () => {
    expect(tableNames(openMemory())).toEqual([
      'import_jobs',
      'import_rows',
      'outbox',
      'stock_leases',
      'stock_versions',
    ]);
  });

  it.each(contractColumns)('creates %s with the columns named in the contract', (table, columns) => {
    expect(columnNames(openMemory(), table)).toEqual(expect.arrayContaining(columns));
  });
});

describe('stock_versions key', () => {
  it('uses seller_id, product_id, size_id and country_code as the composite primary key', () => {
    expect(primaryKeyColumns(openMemory(), 'stock_versions')).toEqual([
      'seller_id',
      'product_id',
      'size_id',
      'country_code',
    ]);
  });

  it('rejects a second stock_versions row with the same seller, product, size and country', () => {
    const db = openMemory();
    insertStockVersion(db, 'PT');

    expect(() => insertStockVersion(db, 'PT')).toThrow(/UNIQUE constraint failed/);
  });

  it('accepts stock_versions rows that differ only by country_code', () => {
    const db = openMemory();
    insertStockVersion(db, 'PT');
    insertStockVersion(db, 'ES');

    expect(rowCount(db, 'stock_versions')).toBe(2);
  });
});

describe('outbox', () => {
  it('has an index on (stock_key, id) for the pending chain per key', () => {
    expect(indexColumnLists(openMemory(), 'outbox')).toContainEqual(['stock_key', 'id']);
  });

  it('rejects a second outbox row with the same event_id', () => {
    const db = openMemory();
    insertOutbox(db, 'event-1');

    expect(() => insertOutbox(db, 'event-1')).toThrow(/UNIQUE constraint failed/);
  });

  it('does not reuse an outbox id after the newest row is deleted', () => {
    const db = openMemory();
    insertOutbox(db, 'event-1');
    const newest = insertOutbox(db, 'event-2');
    db.prepare('DELETE FROM outbox WHERE id = ?').run(newest);

    expect(insertOutbox(db, 'event-3')).toBe(newest + 1);
  });
});

describe('stock_leases key', () => {
  it('uses stock_key as the primary key', () => {
    expect(primaryKeyColumns(openMemory(), 'stock_leases')).toEqual(['stock_key']);
  });

  it('rejects a second lease row for the same stock_key', () => {
    const db = openMemory();
    insertStockLease(db, 'stock-1');

    expect(() => insertStockLease(db, 'stock-1')).toThrow(/UNIQUE constraint failed/);
  });
});

describe('foreign keys and WAL mode', () => {
  it('enables foreign key enforcement on an in-memory database', () => {
    expect(openMemory().pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('rejects an import_rows row whose job_id has no import_jobs row', () => {
    const db = openMemory();

    expect(() => insertImportRow(db, 'missing-job')).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('sets journal mode to wal on a file database', () => {
    const db = open(createTemporaryDatabasePath());

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });
});

describe('one insert per table', () => {
  it('accepts one stock_versions row on an in-memory database', () => {
    const db = openMemory();
    insertStockVersion(db, 'PT');

    expect(rowCount(db, 'stock_versions')).toBe(1);
  });

  it('accepts one import_jobs row on an in-memory database', () => {
    const db = openMemory();
    insertJob(db, 'job-1');

    expect(rowCount(db, 'import_jobs')).toBe(1);
  });

  it('accepts one import_rows row on an in-memory database', () => {
    const db = openMemory();
    insertJob(db, 'job-1');
    insertImportRow(db, 'job-1');

    expect(rowCount(db, 'import_rows')).toBe(1);
  });

  it('accepts one outbox row on an in-memory database', () => {
    const db = openMemory();
    insertOutbox(db, 'event-1');

    expect(rowCount(db, 'outbox')).toBe(1);
  });

  it('accepts one stock_leases row on an in-memory database', () => {
    const db = openMemory();
    insertStockLease(db, 'stock-1');

    expect(rowCount(db, 'stock_leases')).toBe(1);
  });
});
