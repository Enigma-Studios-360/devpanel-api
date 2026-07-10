import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { githubOauthController } from './github-oauth.controller';
import { githubController } from './github.controller';

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

// Repo picker: list the repos of the user's CONNECTED GitHub account.
router.get('/repos', requireAuth, githubController.myRepos);

export const githubRouter = router;
