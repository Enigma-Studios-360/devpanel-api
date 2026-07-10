import type { RequestHandler } from 'express';
import { importService } from './import.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';
import { BadRequestError } from '../../shared/errors/http-errors';

export const importController = {
  /** POST /api/projects/:projectId/import — sube el ZIP y devuelve el análisis. */
  analyze: (async (req, res, next) => {
    try {
      if (!req.file) {
        throw new BadRequestError('No se recibió el ZIP (campo multipart "file").');
      }
      const analysis = await importService.analyze(
        getParam(req, 'projectId'),
        req.file,
      );
      res.status(201).json(ok({ analysis }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** POST /api/projects/:projectId/import/:importId/confirm — crea repo + push. */
  confirm: (async (req, res, next) => {
    try {
      const result = await importService.confirm(
        getParam(req, 'projectId'),
        req.user!.id,
        getParam(req, 'importId'),
        {
          repoName: String(req.body?.repoName ?? ''),
          isPrivate: Boolean(req.body?.isPrivate ?? true),
        },
      );
      res.status(201).json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
