import type { Db } from '../infra/db.js';
import type { StockKey } from '../domain/stockKey.js';

export type VersionOutcome = 'APPLIED' | 'STALE';

export interface VersionStore {
  readApplied(key: StockKey): number | undefined;
  tryApply(key: StockKey, sourceVersion: number): VersionOutcome;
}

export function createVersionStore(db: Db): VersionStore {
  const selectStatement = db.prepare<[string, string, string, string], { applied_source_version: number }>(
    `SELECT applied_source_version FROM stock_versions
     WHERE seller_id = ? AND product_id = ? AND size_id = ? AND country_code = ?`,
  );
  const upsertStatement = db.prepare(
    `INSERT INTO stock_versions (seller_id, product_id, size_id, country_code, applied_source_version)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (seller_id, product_id, size_id, country_code)
     DO UPDATE SET applied_source_version = excluded.applied_source_version
     WHERE stock_versions.applied_source_version < excluded.applied_source_version`,
  );

  return {
    readApplied(key) {
      return selectStatement.get(key.sellerId, key.productId, key.sizeId, key.countryCode)?.applied_source_version;
    },
    tryApply(key, sourceVersion) {
      const { changes } = upsertStatement.run(
        key.sellerId,
        key.productId,
        key.sizeId,
        key.countryCode,
        sourceVersion,
      );
      return changes === 1 ? 'APPLIED' : 'STALE';
    },
  };
}
