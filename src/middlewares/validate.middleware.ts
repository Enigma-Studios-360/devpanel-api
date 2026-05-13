import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodTypeAny, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
      return next(parsed.error);
    }

    if (source === 'body') req.body = parsed.data;
    else if (source === 'query') req.query = parsed.data as typeof req.query;
    else req.params = parsed.data as typeof req.params;

    return next();
  };
