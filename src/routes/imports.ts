import express, { Router } from 'express';
import type { Services } from '../services.js';
import { createJob, readJobStatus, readRowErrors } from '../imports/importJobs.js';
import { validateUpload } from '../imports/bulkImportWorker.js';

const defaultPageSize = 100;
const maxPageSize = 1000;

export function importsRouter(services: Services): Router {
  const router = Router();
  const { db } = services;

  router.post(
    '/v1/availability/imports',
    express.text({ type: 'text/csv', limit: '20mb' }),
    (request, response) => {
      const csvBody: unknown = request.body;
      if (typeof csvBody !== 'string' || csvBody.trim() === '') {
        response.status(400).json({ error: 'expected a non-empty text/csv body' });
        return;
      }
      const validated = validateUpload(csvBody);
      if (!validated.ok) {
        response.status(400).json({ error: 'invalid CSV header', errors: validated.errors });
        return;
      }
      const jobId = createJob(db, csvBody, validated.value, services.pipeline.now());
      services.importWorker.kick();
      response.status(202).json({
        jobId,
        state: 'QUEUED',
        totalRows: validated.value,
        statusUrl: `/v1/availability/imports/${jobId}`,
      });
    },
  );

  router.get('/v1/availability/imports/:jobId', (request, response) => {
    const { jobId } = request.params;
    const job = readJobStatus(db, jobId);
    if (!job) {
      response.status(404).json({ error: 'job not found' });
      return;
    }
    const limit = parseQueryInteger(request.query.limit, defaultPageSize, maxPageSize);
    const offset = parseQueryInteger(request.query.offset, 0, Number.MAX_SAFE_INTEGER);
    if (limit === undefined || offset === undefined) {
      response.status(400).json({ error: `limit must be 0 to ${maxPageSize}, offset must be a non-negative integer` });
      return;
    }
    response.json({
      jobId: job.jobId,
      state: job.state,
      totalRows: job.totalRows,
      processedRows: job.succeededRows + job.failedRows + job.skippedRows,
      succeededRows: job.succeededRows,
      failedRows: job.failedRows,
      skippedRows: job.skippedRows,
      errors: readRowErrors(db, jobId, limit, offset).map((row) => ({ line: row.lineNumber, reason: row.reason })),
      limit,
      offset,
    });
  });

  return router;
}

function parseQueryInteger(value: unknown, fallback: number, max: number): number | undefined {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return parsed <= max ? parsed : undefined;
}
