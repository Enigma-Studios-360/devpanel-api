import type { RequestHandler } from 'express';
import { PlanLimitError } from '../shared/errors/http-errors';
import type { PlanLimits } from '../shared/constants/plans';

type LimitKey = keyof PlanLimits;

/**
 * Plan limit middleware (Phase 1: scaffold).
 * In Phase 2 it will:
 *   1. Resolve the team subscription from req.user.teamId
 *   2. Compute current usage (projects, members, storage)
 *   3. Reject the request when usage would exceed `limit`
 */
export const enforcePlanLimit = (_limit: LimitKey): RequestHandler => {
  return (_req, _res, next) => {
    // TODO(phase-2): implement actual usage check
    if (process.env.PLAN_LIMITS_ENFORCED === 'true') {
      return next(new PlanLimitError('Plan limit enforcement not implemented yet'));
    }
    return next();
  };
};
