import { validateCsvHeader, validateCsvRow, type ValidationError, type ValidationResult } from '../domain/validation.js';
import { stockKeyText } from '../domain/stockKey.js';
import { createSnapshotLookup } from '../index/snapshotIndex.js';
import type { HttpDeps } from '../clients/httpJson.js';
import type { Db } from '../infra/db.js';
import { mapWithConcurrency } from '../infra/mapWithConcurrency.js';
import { processStockChange, type ChangeResult, type PipelineDeps, type StockChange } from '../pipeline/processStockChange.js';
import type { VersionStore } from '../stores/versionStore.js';
import {
  finishJob,
  failJob,
  markRunning,
  nextQueuedJob,
  readRecordedLines,
  recordChunk,
  type LineResult,
} from './importJobs.js';
import { splitCsvLine } from './csvLine.js';

export interface ImportDeps {
  db: Db;
  versions: VersionStore;
  http: HttpDeps;
  now: () => number;
}

interface CsvLine {
  lineNumber: number;
  text: string;
}

interface GroupedChange {
  lineNumber: number;
  change: StockChange;
}

export function validateUpload(csvBody: string): ValidationResult<number> {
  const [header = ''] = csvText(csvBody);
  const headerResult = validateCsvHeader(splitCsvLine(header) ?? []);
  if (!headerResult.ok) {
    return { ok: false, errors: headerResult.errors };
  }
  return { ok: true, value: dataLines(csvBody).length };
}

export function createImportWorker(deps: ImportDeps): { kick: () => void } {
  let draining: Promise<void> | undefined;

  async function drain(): Promise<void> {
    for (let job = nextQueuedJob(deps.db); job; job = nextQueuedJob(deps.db)) {
      await runJob(deps, job.jobId, job.csvBody);
    }
  }

  return {
    kick: () => {
      draining ??= drain().finally(() => {
        draining = undefined;
      });
    },
  };
}

async function runJob(deps: ImportDeps, jobId: string, csvBody: string): Promise<void> {
  const pipeline: PipelineDeps = {
    db: deps.db,
    versions: deps.versions,
    http: deps.http,
    enrich: createSnapshotLookup(deps.http),
    now: deps.now,
  };
  markRunning(deps.db, jobId, deps.now());
  try {
    const recorded = readRecordedLines(deps.db, jobId);
    const pending = dataLines(csvBody).filter((line) => !recorded.has(line.lineNumber));
    for (const chunk of chunked(pending, deps.http.config.chunkSize)) {
      const results = await processChunk(pipeline, deps.http.config.concurrency, chunk);
      recordChunk(deps.db, jobId, results, deps.now());
    }
    finishJob(deps.db, jobId, deps.now());
  } catch {
    failJob(deps.db, jobId, deps.now());
  }
}

async function processChunk(pipeline: PipelineDeps, concurrency: number, lines: CsvLine[]): Promise<LineResult[]> {
  const results: LineResult[] = [];
  const groups = new Map<string, GroupedChange[]>();
  for (const line of lines) {
    const cells = splitCsvLine(line.text);
    if (cells === undefined) {
      results.push({ lineNumber: line.lineNumber, outcome: 'FAILED', reason: 'malformed CSV line' });
      continue;
    }
    const validated = validateCsvRow(cells, line.lineNumber);
    if (!validated.ok) {
      results.push({ lineNumber: line.lineNumber, outcome: 'FAILED', reason: describeErrors(validated.errors) });
      continue;
    }
    const key = stockKeyText(validated.value);
    const group = groups.get(key) ?? [];
    group.push({ lineNumber: line.lineNumber, change: validated.value });
    groups.set(key, group);
  }
  const grouped = await mapWithConcurrency([...groups.values()], concurrency, async (group) => {
    const groupResults: LineResult[] = [];
    for (const item of group) {
      const result = await processStockChange(pipeline, item.change);
      groupResults.push(toLineResult(item.lineNumber, result));
    }
    return groupResults;
  });
  return [...results, ...grouped.flat()];
}

function toLineResult(lineNumber: number, result: ChangeResult): LineResult {
  switch (result.kind) {
    case 'APPLIED':
      return { lineNumber, outcome: 'APPLIED' };
    case 'SKIPPED_STALE':
      return { lineNumber, outcome: 'SKIPPED', reason: 'stale or duplicate sourceVersion' };
    case 'REJECTED':
    case 'FAILED':
      return { lineNumber, outcome: 'FAILED', reason: result.reason };
  }
}

function csvText(csvBody: string): string[] {
  return csvBody.replace(/^\uFEFF/, '').split(/\r?\n/);
}

function dataLines(csvBody: string): CsvLine[] {
  return csvText(csvBody)
    .map((text, index) => ({ lineNumber: index + 1, text }))
    .slice(1)
    .filter((line) => line.text.trim() !== '');
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

function describeErrors(errors: ValidationError[]): string {
  return errors.map((error) => `${error.field} ${error.reason}`).join('; ');
}
