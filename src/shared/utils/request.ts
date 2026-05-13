import type { Request } from 'express';

/**
 * Express 5 types `req.params[key]` as `string | string[]` to support array
 * wildcard routes. We never use those, so this helper coerces to string.
 */
export const getParam = (req: Request, key: string): string => {
  const value = req.params[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};
