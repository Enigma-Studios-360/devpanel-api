import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { githubOauthController } from './github-oauth.controller';

const router = Router();

// Per-user GitHub OAuth ("Connect GitHub"). The project-scoped GitHub
// endpoints (commits/branches/issues/...) live under /api/projects/:id/github.
//
// NOTE: the callback is hit by GitHub's browser redirect with NO auth header,
// so requireAuth is applied per-route (not globally) — identity for the
// callback travels in the signed `state`.
router.get('/oauth/start', requireAuth, githubOauthController.start);
router.get('/oauth/callback', githubOauthController.callback);
router.get('/oauth/status', requireAuth, githubOauthController.status);
router.post('/oauth/disconnect', requireAuth, githubOauthController.disconnect);

export const githubRouter = router;
