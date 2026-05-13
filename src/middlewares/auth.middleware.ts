import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../shared/errors/http-errors';
import type { RequestUser } from '../shared/types/request-user';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

/**
 * Auth middleware (Phase 1: structure only).
 * In Phase 2 it will be wired into protected routes.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const cookieToken = (req as unknown as { cookies?: Record<string, string> })
      .cookies?.token;

    const token =
      header && header.startsWith('Bearer ') ? header.slice(7) : cookieToken;

    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;

    const user: RequestUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return next(error);
    }
    return next(new UnauthorizedError('Invalid or expired token'));
  }
};
