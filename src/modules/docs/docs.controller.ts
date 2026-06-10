import type { RequestHandler } from 'express';
import { docsService } from './docs.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const docsController = {
  get: (async (req, res, next) => {
    try {
      const doc = await docsService.getOrCreate(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok({ doc }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  patch: (async (req, res, next) => {
    try {
      const doc = await docsService.update(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body,
      );
      res.json(ok({ doc }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  generateReadme: (async (req, res, next) => {
    try {
      const { markdown, doc, projectName } = await docsService.generateReadme(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(
        ok({
          markdown,
          projectName,
          completionPercent: doc.completionPercent,
        }),
      );
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  generateAi: (async (req, res, next) => {
    try {
      const doc = await docsService.generateWithAi(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok({ doc }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  downloadReadme: (async (req, res, next) => {
    try {
      const { markdown, filename } = await docsService.downloadReadme(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(markdown);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
