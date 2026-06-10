import type { RequestHandler } from 'express';
import { deployService } from './deploy.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const deployController = {
  /**
   * Lightweight probe so the frontend can render a "not configured"
   * panel without rendering the wizard. Returns whether the backend
   * has a Vercel token at all — not anything sensitive.
   */
  status: (async (_req, res, next) => {
    try {
      res.json(
        ok({
          configured: deployService.isConfigured(),
          provider: 'VERCEL',
        }),
      );
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** Step 1 of the wizard — returns suggested build config. */
  prepare: (async (req, res, next) => {
    try {
      const result = await deployService.prepare(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** Returns last deployment + history. Refreshes in-flight status. */
  history: (async (req, res, next) => {
    try {
      const result = await deployService.listForProject(
        getParam(req, 'projectId'),
        req.user!.id,
        { refreshLatest: true },
      );
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** Step 4 of the wizard — actually create the deployment on Vercel. */
  trigger: (async (req, res, next) => {
    try {
      const doc = await deployService.trigger(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body,
      );
      res.status(201).json(ok({ deployment: doc }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** Polling endpoint: refresh one deployment from Vercel. */
  refresh: (async (req, res, next) => {
    try {
      const doc = await deployService.refresh(
        getParam(req, 'projectId'),
        getParam(req, 'deploymentId'),
        req.user!.id,
      );
      res.json(ok({ deployment: doc }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
