import { Types } from 'mongoose';
import { TeamModel, type TeamDocument } from './team.model';
import { TeamMemberModel } from './team-member.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { ProjectModel } from '../projects/project.model';
import { UserModel } from '../users/user.model';
import { activityService } from '../activity/activity.service';
import { slugify } from '../../shared/utils/slugify';
import {
  ConflictError,
  NotFoundError,
} from '../../shared/errors/http-errors';
import { PLAN_LIMITS } from '../../shared/constants/plans';

interface CreateTeamInput {
  name: string;
}

const ensureUniqueSlug = async (base: string): Promise<string> => {
  const safeBase = slugify(base) || 'team';
  let candidate = safeBase;
  let suffix = 1;
  // Try up to a few times — for a personal SaaS this is fine
  while (await TeamModel.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${safeBase}-${suffix}`;
    if (suffix > 50) {
      throw new ConflictError('Could not generate a unique slug for the team');
    }
  }
  return candidate;
};

export const teamService = {
  async create(actorId: string, input: CreateTeamInput): Promise<TeamDocument> {
    const slug = await ensureUniqueSlug(input.name);

    const team = await TeamModel.create({
      name: input.name.trim(),
      slug,
      owner: new Types.ObjectId(actorId),
      plan: 'FREE',
    });

    await TeamMemberModel.create({
      team: team._id,
      user: new Types.ObjectId(actorId),
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: new Date(),
    });

    await SubscriptionModel.create({
      team: team._id,
      plan: 'FREE',
      status: 'ACTIVE',
      limits: PLAN_LIMITS.FREE,
    });

    await activityService.logTeamCreated(team._id, actorId, team.name);

    return team;
  },

  async listForUser(userId: string): Promise<unknown[]> {
    const memberships = await TeamMemberModel.find({
      user: new Types.ObjectId(userId),
      status: 'ACTIVE',
    })
      .populate('team')
      .lean();

    const teams = memberships
      .filter((m) => m.team)
      .map((m) => ({ team: m.team, role: m.role }));

    // Pull project counts for the convenience of the UI
    const teamIds = teams
      .map((t) => (t.team as { _id: Types.ObjectId })._id)
      .filter(Boolean);

    const counts = teamIds.length
      ? await ProjectModel.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
          { $match: { team: { $in: teamIds } } },
          {
            $group: {
              _id: '$team',
              total: { $sum: 1 },
              active: { $sum: { $cond: [{ $ne: ['$status', 'ARCHIVED'] }, 1, 0] } },
            },
          },
        ])
      : [];

    const countMap = new Map(counts.map((c) => [c._id.toString(), c]));

    return teams.map((t) => {
      const teamObj = t.team as { _id: Types.ObjectId; toJSON?: () => unknown };
      const teamId = teamObj._id.toString();
      const count = countMap.get(teamId);
      return {
        team: teamObj,
        role: t.role,
        projectsCount: count?.total ?? 0,
        activeProjectsCount: count?.active ?? 0,
      };
    });
  },

  async getById(teamId: string): Promise<TeamDocument> {
    const team = await TeamModel.findById(teamId);
    if (!team) throw new NotFoundError('Team not found');
    return team;
  },

  async listMembers(teamId: string): Promise<unknown[]> {
    const members = await TeamMemberModel.find({
      team: new Types.ObjectId(teamId),
    })
      .populate({ path: 'user', model: UserModel, select: 'name email avatarUrl status' })
      .lean();
    return members;
  },
};
