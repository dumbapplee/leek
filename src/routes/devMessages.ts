import express, { Router } from 'express';
import { validateSellerInventoryChanged } from '../domain/validation.js';
import { processStockChange, type ChangeResult, type PipelineDeps } from '../pipeline/processStockChange.js';

export function devMessagesRouter(pipeline: PipelineDeps): Router {
  const router = Router();
  router.post('/_dev/messages', express.json(), async (request, response) => {
    const validated = validateSellerInventoryChanged(request.body);
    if (!validated.ok) {
      response.status(400).json({ kind: 'INVALID', errors: validated.errors });
      return;
    }
    const result = await processStockChange(pipeline, validated.value);
    response.status(httpStatusFor(result)).json(result);
  });
  return router;
}

function httpStatusFor(result: ChangeResult): number {
  switch (result.kind) {
    case 'APPLIED':
    case 'SKIPPED_STALE':
      return 200;
    case 'REJECTED':
      return 422;
    case 'FAILED':
      return 502;
  }
}
