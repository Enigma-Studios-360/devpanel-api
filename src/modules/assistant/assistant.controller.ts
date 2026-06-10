import type { RequestHandler } from 'express';
import { assistantService } from './assistant.service';
import { ok } from '../../shared/types/api-response';

export const assistantController = {
  /**
   * Health-ish probe so the frontend can hide the input box when the
   * upstream LLM is not configured (e.g. local dev without a key). The
   * response is intentionally narrow — we don't expose the key, model
   * name or base URL.
   */
  status: (async (req, res, next) => {
    try {
      res.json(ok(await assistantService.status(req.user!.id)));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** POST /api/assistant/chat — proxy a single turn to DeepSeek. */
  chat: (async (req, res, next) => {
    try {
      const result = await assistantService.chat(req.user!.id, req.body);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
