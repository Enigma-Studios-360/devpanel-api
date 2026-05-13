import type { RequestHandler } from 'express';
import { subscriptionService } from './subscription.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';
import type { PlanCode } from '../../shared/constants/plans';

export const subscriptionController = {
  getForTeam: (async (req, res, next) => {
    try {
      const subscription = await subscriptionService.getForTeam(getParam(req, 'teamId'));
      res.json(ok({ subscription }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  simulateUpgrade: (async (req, res, next) => {
    try {
      const subscription = await subscriptionService.simulateUpgrade(
        getParam(req, 'teamId'),
        req.user!.id,
        req.body.plan as PlanCode,
      );
      res.json(ok({ subscription, simulated: true }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
