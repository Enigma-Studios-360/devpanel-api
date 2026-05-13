import type { RequestHandler } from 'express';
import { teamService } from './team.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const teamController = {
  list: (async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const teams = await teamService.listForUser(userId);
      res.json(ok(teams));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  create: (async (req, res, next) => {
    try {
      const team = await teamService.create(req.user!.id, req.body);
      res.status(201).json(ok({ team }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    try {
      const team = await teamService.getById(getParam(req, 'teamId'));
      res.json(ok({ team, role: req.user?.teamRole }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  members: (async (req, res, next) => {
    try {
      const members = await teamService.listMembers(getParam(req, 'teamId'));
      res.json(ok(members));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
