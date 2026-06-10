import type { RequestHandler } from 'express';
import { githubOauthService } from './github-oauth.service';
import { ok } from '../../shared/types/api-response';
import { env } from '../../config/env';

export const githubOauthController = {
  /** GET /api/github/oauth/start — returns the GitHub authorize URL (auth). */
  start: (async (req, res, next) => {
    try {
      res.json(ok({ url: githubOauthService.buildAuthorizeUrl(req.user!.id) }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /**
   * GET /api/github/oauth/callback — hit by GitHub's browser redirect (no
   * auth header; identity is in the signed `state`). Always redirects back
   * to the SPA with a status flag instead of returning JSON.
   */
  callback: (async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const back = (status: string): void =>
      void res.redirect(`${env.webBaseUrl}/app/dashboard?github=${status}`);
    if (!code || !state) return back('error');
    try {
      await githubOauthService.handleCallback(code, state);
      back('connected');
    } catch {
      back('error');
    }
  }) as RequestHandler,

  /** GET /api/github/oauth/status — { configured, connected, login } (auth). */
  status: (async (req, res, next) => {
    try {
      res.json(ok(await githubOauthService.status(req.user!.id)));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** POST /api/github/oauth/disconnect — clears the stored token (auth). */
  disconnect: (async (req, res, next) => {
    try {
      await githubOauthService.disconnect(req.user!.id);
      res.json(ok({ disconnected: true }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
