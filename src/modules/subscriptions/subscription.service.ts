import { Types } from 'mongoose';
import { SubscriptionModel } from './subscription.model';
import { TeamModel } from '../teams/team.model';
import { activityService } from '../activity/activity.service';
import { NotFoundError } from '../../shared/errors/http-errors';
import { PLAN_LIMITS, type PlanCode } from '../../shared/constants/plans';

export const subscriptionService = {
  async getForTeam(teamId: string): Promise<unknown> {
    const teamObjId = new Types.ObjectId(teamId);
    let subscription = await SubscriptionModel.findOne({ team: teamObjId });

    if (!subscription) {
      // Self-heal: ensure every team has a subscription document
      const team = await TeamModel.findById(teamObjId);
      if (!team) throw new NotFoundError('Team not found');
      subscription = await SubscriptionModel.create({
        team: teamObjId,
        plan: team.plan,
        status: 'ACTIVE',
        limits: PLAN_LIMITS[team.plan as PlanCode] ?? PLAN_LIMITS.FREE,
      });
    }

    return subscription;
  },

  async simulateUpgrade(
    teamId: string,
    actorId: string,
    targetPlan: PlanCode,
  ): Promise<unknown> {
    const teamObjId = new Types.ObjectId(teamId);
    const subscription = await SubscriptionModel.findOne({ team: teamObjId });
    const team = await TeamModel.findById(teamObjId);
    if (!team) throw new NotFoundError('Team not found');

    const fromPlan = (subscription?.plan ?? team.plan) as PlanCode;
    const limits = PLAN_LIMITS[targetPlan];

    if (subscription) {
      subscription.plan = targetPlan;
      subscription.status = 'ACTIVE';
      subscription.limits = limits;
      await subscription.save();
    } else {
      await SubscriptionModel.create({
        team: teamObjId,
        plan: targetPlan,
        status: 'ACTIVE',
        limits,
      });
    }

    team.plan = targetPlan;
    await team.save();

    if (fromPlan !== targetPlan) {
      await activityService.logSubscriptionChanged(
        teamObjId,
        actorId,
        fromPlan,
        targetPlan,
      );
    }

    return SubscriptionModel.findOne({ team: teamObjId });
  },
};
