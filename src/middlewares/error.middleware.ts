import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors/AppError';
import { fail } from '../shared/types/api-response';
import { isProduction } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(fail('NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json(
      fail('VALIDATION_ERROR', 'Validation failed', err.issues),
    );
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json(fail(err.code, err.message, err.details));
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[error]', err);

  res.status(500).json(
    fail(
      'INTERNAL_ERROR',
      isProduction ? 'Internal server error' : (err as Error)?.message ?? 'Unknown error',
    ),
  );
};
