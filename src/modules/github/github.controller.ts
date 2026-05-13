import type { RequestHandler } from 'express';
import { githubService } from './github.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const githubController = {
  link: (async (req, res, next) => {
    try {
      const info = await githubService.linkRepo(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body.input,
      );
      res.status(201).json(ok({ repo: info }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  unlink: (async (req, res, next) => {
    try {
      await githubService.unlinkRepo(getParam(req, 'projectId'), req.user!.id);
      res.json(ok({ unlinked: true }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  info: (async (req, res, next) => {
    try {
      const repo = await githubService.getRepoInfo(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok({ repo }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  commits: (async (req, res, next) => {
    try {
      const commits = await githubService.listCommits(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok(commits));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  branches: (async (req, res, next) => {
    try {
      const branches = await githubService.listBranches(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok(branches));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  issues: (async (req, res, next) => {
    try {
      const state = (req.query.state as 'open' | 'closed' | 'all') ?? 'open';
      const issues = await githubService.listIssues(
        getParam(req, 'projectId'),
        req.user!.id,
        state,
      );
      res.json(ok(issues));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  createIssue: (async (req, res, next) => {
    try {
      const issue = await githubService.createIssue(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body.title,
        req.body.body,
      );
      res.status(201).json(ok({ issue }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
