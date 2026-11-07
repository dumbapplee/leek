import { randomUUID } from 'node:crypto';
import type { Db } from '../infra/db.js';

export type RowOutcome = 'APPLIED' | 'SKIPPED' | 'FAILED';

export interface LineResult {
  lineNumber: number;
  outcome: RowOutcome;
  reason?: string;
}

export interface JobStatusRow {
  jobId: string;
  state: string;
  totalRows: number;
  succeededRows: number;
  failedRows: number;
  skippedRows: number;
}

export interface RowErrorRow {
  lineNumber: number;
  reason: string;
}

export function createJob(db: Db, csvBody: string, totalRows: number, nowMs: number): string {
  const jobId = randomUUID();
  db.prepare(
    `INSERT INTO import_jobs (job_id, state, csv_body, total_rows, created_at_ms, updated_at_ms)
     VALUES (?, 'QUEUED', ?, ?, ?, ?)`,
  ).run(jobId, csvBody, totalRows, nowMs, nowMs);
  return jobId;
}

export function nextQueuedJob(db: Db): { jobId: string; csvBody: string } | undefined {
  return db
    .prepare<[], { jobId: string; csvBody: string }>(
      `SELECT job_id AS jobId, csv_body AS csvBody FROM import_jobs
       WHERE state = 'QUEUED' ORDER BY created_at_ms, job_id LIMIT 1`,
    )
    .get();
}

export function markRunning(db: Db, jobId: string, nowMs: number): void {
  db.prepare(`UPDATE import_jobs SET state = 'RUNNING', updated_at_ms = ? WHERE job_id = ?`).run(nowMs, jobId);
}

export function recordChunk(db: Db, jobId: string, results: LineResult[], nowMs: number): void {
  const insertRow = db.prepare(
    `INSERT INTO import_rows (job_id, line_number, outcome, reason) VALUES (?, ?, ?, ?)`,
  );
  const counts = { APPLIED: 0, SKIPPED: 0, FAILED: 0 };
  db.transaction(() => {
    for (const result of results) {
      insertRow.run(jobId, result.lineNumber, result.outcome, result.reason ?? null);
      counts[result.outcome] += 1;
    }
    db.prepare(
      `UPDATE import_jobs
       SET succeeded_rows = succeeded_rows + ?, failed_rows = failed_rows + ?,
           skipped_rows = skipped_rows + ?, updated_at_ms = ?
       WHERE job_id = ?`,
    ).run(counts.APPLIED, counts.FAILED, counts.SKIPPED, nowMs, jobId);
  })();
}

export function finishJob(db: Db, jobId: string, nowMs: number): void {
  db.prepare(
    `UPDATE import_jobs
     SET state = CASE WHEN failed_rows > 0 THEN 'COMPLETED_WITH_ERRORS' ELSE 'COMPLETED' END,
         csv_body = '', updated_at_ms = ?
     WHERE job_id = ?`,
  ).run(nowMs, jobId);
}

export function failJob(db: Db, jobId: string, nowMs: number): void {
  db.prepare(`UPDATE import_jobs SET state = 'FAILED', csv_body = '', updated_at_ms = ? WHERE job_id = ?`).run(
    nowMs,
    jobId,
  );
}

export function readJobStatus(db: Db, jobId: string): JobStatusRow | undefined {
  return db
    .prepare<[string], JobStatusRow>(
      `SELECT job_id AS jobId, state, total_rows AS totalRows, succeeded_rows AS succeededRows,
              failed_rows AS failedRows, skipped_rows AS skippedRows
       FROM import_jobs WHERE job_id = ?`,
    )
    .get(jobId);
}

export function readRowErrors(db: Db, jobId: string, limit: number, offset: number): RowErrorRow[] {
  return db
    .prepare<[string, number, number], RowErrorRow>(
      `SELECT line_number AS lineNumber, reason FROM import_rows
       WHERE job_id = ? AND outcome = 'FAILED'
       ORDER BY line_number LIMIT ? OFFSET ?`,
    )
    .all(jobId, limit, offset);
}

export function recoverRunningJobs(db: Db, nowMs: number): void {
  // Recorded rows and counters are kept so the worker resumes after the last recorded line.
  db.prepare(`UPDATE import_jobs SET state = 'QUEUED', updated_at_ms = ? WHERE state = 'RUNNING'`).run(nowMs);
}

export function readRecordedLines(db: Db, jobId: string): Set<number> {
  const rows = db
    .prepare<[string], { lineNumber: number }>(
      `SELECT line_number AS lineNumber FROM import_rows WHERE job_id = ?`,
    )
    .all(jobId);
  return new Set(rows.map((row) => row.lineNumber));
}
