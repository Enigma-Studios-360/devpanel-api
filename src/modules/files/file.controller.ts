import type { RequestHandler } from 'express';
import { fileService } from './file.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';
import { BadRequestError } from '../../shared/errors/http-errors';

export const fileController = {
  listByProject: (async (req, res, next) => {
    try {
      const { files, usage } = await fileService.listByProject(
        getParam(req, 'projectId'),
      );
      res.json(ok({ files, usage }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  upload: (async (req, res, next) => {
    try {
      if (!req.file) {
        throw new BadRequestError('No file provided (multipart field "file")');
      }
      const taskId =
        typeof req.body?.taskId === 'string' ? req.body.taskId : undefined;
      const { file, usage } = await fileService.create(
        getParam(req, 'projectId'),
        req.user!.id,
        req.file,
        taskId,
      );
      res.status(201).json(ok({ file, usage }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  download: (async (req, res, next) => {
    try {
      const { absolutePath, originalName, mimeType } =
        await fileService.getForDownload(getParam(req, 'fileId'));
      res.setHeader('Content-Type', mimeType);
      res.download(absolutePath, originalName, (error) => {
        if (error && !res.headersSent) next(error);
      });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  remove: (async (req, res, next) => {
    try {
      const { usage } = await fileService.remove(
        getParam(req, 'fileId'),
        req.user!.id,
      );
      res.json(ok({ deleted: true, usage }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
