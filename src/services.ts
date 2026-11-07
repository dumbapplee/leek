import type { Config } from './config.js';
import { lookupProductContext } from './clients/productContextClient.js';
import { sleep, type HttpDeps } from './clients/httpJson.js';
import { openDatabase, type Db } from './infra/db.js';
import { createImportWorker } from './imports/bulkImportWorker.js';
import { createOutboxPublisher } from './outbox/outboxPublisher.js';
import type { PipelineDeps } from './pipeline/processStockChange.js';
import { createVersionStore } from './stores/versionStore.js';

export interface Services {
  config: Config;
  db: Db;
  pipeline: PipelineDeps;
  importWorker: { kick: () => void };
  publishOutbox: () => Promise<number>;
}

export function createServices(config: Config): Services {
  const db = openDatabase(config.dbPath);
  const http: HttpDeps = { config, sleep };
  const versions = createVersionStore(db);
  const now = (): number => Date.now();
  return {
    config,
    db,
    pipeline: {
      db,
      versions,
      http,
      enrich: (productId, sizeId, countryCode) => lookupProductContext(http, productId, sizeId, countryCode),
      now,
    },
    importWorker: createImportWorker({ db, versions, http, now }),
    publishOutbox: createOutboxPublisher(db, http, now),
  };
}
