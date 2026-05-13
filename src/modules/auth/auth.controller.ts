import type { RequestHandler } from 'express';
import { authService } from './auth.service';
import { ok } from '../../shared/types/api-response';
import { activityService } from '../activity/activity.service';

export const authController = {
  register: (async (req, res, next) => {
    try {
      const session = await authService.register(req.body);
      // Best-effort log; never block registration on logging failure
      void activityService.logUserRegistered(session.user._id, session.user.name);
      res.status(201).json(ok(session));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  login: (async (req, res, next) => {
    try {
      const session = await authService.login(req.body);
      res.json(ok(session));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  me: (async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
        return;
      }
      const user = await authService.me(userId);
      res.json(ok({ user }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  logout: ((_req, res) => {
    // Stateless JWT — frontend clears the token. We return 200 for symmetry.
    res.json(ok({ loggedOut: true }));
  }) as RequestHandler,
};
