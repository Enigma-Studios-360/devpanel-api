import { Types } from 'mongoose';
import { TeamMemberModel } from '../teams/team-member.model';
import { TeamModel } from '../teams/team.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { ProjectModel, type ProjectDocument } from '../projects/project.model';
import { TaskModel } from '../tasks/task.model';
import { ActivityLogModel } from '../activity/activity.model';
import { activityService } from '../activity/activity.service';
import { slugify } from '../../shared/utils/slugify';
import { PLAN_LIMITS } from '../../shared/constants/plans';
import { ConflictError } from '../../shared/errors/http-errors';

/**
 * Single endpoint that powers the home dashboard. Built as one round-trip
 * so the UI doesn't need to orchestrate five separate requests just to
 * render the landing area after login.
 *
 * Numbers are intentionally coarse — this is a glanceable overview, not
 * a report. Heavy aggregations live elsewhere.
 */

export interface DashboardOverview {
  stats: {
    totalTeams: number;
    totalProjects: number;
    activeProjects: number;
    openTasksAssignedToMe: number;
    overdueTasksAssignedToMe: number;
  };
  recentProjects: Array<{
    _id: string;
    name: string;
    slug: string;
    status: string;
    color: string;
    teamId: string;
    teamName: string | null;
    updatedAt: string;
  }>;
  myOpenTasks: Array<{
    _id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string | null;
    projectId: string;
    projectName: string | null;
    overdue: boolean;
  }>;
  recentActivity: Array<{
    _id: string;
    type: string;
    message: string;
    createdAt: string;
    actor?: { _id: string; name: string; avatarUrl?: string };
    projectId?: string | null;
    teamId?: string | null;
  }>;
}

interface ProjectLean {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  status: string;
  color?: string;
  team: Types.ObjectId | { _id: Types.ObjectId; name?: string };
  updatedAt?: Date;
}

interface TaskLean {
  _id: Types.ObjectId;
  title: string;
  status: string;
  priority: string;
  dueDate?: Date;
  project: Types.ObjectId | { _id: Types.ObjectId; name?: string };
}

interface ActivityLean {
  _id: Types.ObjectId;
  type: string;
  message: string;
  createdAt: Date;
  actor?: { _id?: Types.ObjectId; name?: string; avatarUrl?: string } | null;
  project?: Types.ObjectId | null;
  team?: Types.ObjectId | null;
}

const safeStr = (v: unknown): string => {
  if (v && typeof v === 'object' && 'toString' in v) {
    return (v as { toString(): string }).toString();
  }
  return typeof v === 'string' ? v : '';
};

export const dashboardService = {
  /**
   * Build the dashboard payload for the given user. Reads:
   *
   *   - TeamMember rows to know which teams the user belongs to.
   *   - Projects in those teams (counts + 5 most recent).
   *   - Tasks assigned to the user that are still open.
   *   - Activity logs across the user's teams (newest 10).
   */
  async overview(userId: string): Promise<DashboardOverview> {
    const userObjId = new Types.ObjectId(userId);

    // 1) Teams I belong to.
    const memberships = await TeamMemberModel.find({
      user: userObjId,
      status: 'ACTIVE',
    })
      .select('team')
      .lean();
    const teamIds = memberships.map((m) => m.team as Types.ObjectId);

    if (teamIds.length === 0) {
      // Fresh user — return the empty shape so the UI can render the
      // "welcome, create your first team" state without conditional null checks.
      return {
        stats: {
          totalTeams: 0,
          totalProjects: 0,
          activeProjects: 0,
          openTasksAssignedToMe: 0,
          overdueTasksAssignedToMe: 0,
        },
        recentProjects: [],
        myOpenTasks: [],
        recentActivity: [],
      };
    }

    // 2) Project counts + 5 most recently touched.
    const [totalProjects, activeProjects, recentProjectDocs] = await Promise.all([
      ProjectModel.countDocuments({ team: { $in: teamIds } }),
      ProjectModel.countDocuments({
        team: { $in: teamIds },
        status: { $ne: 'ARCHIVED' },
      }),
      ProjectModel.find({ team: { $in: teamIds } })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate('team', 'name')
        .lean<ProjectLean[]>(),
    ]);

    // 3) Tasks assigned to me that are still in the open columns.
    const now = new Date();
    const [openTaskDocs, openTasksTotal, overdueTasksAssignedToMe] =
      await Promise.all([
        TaskModel.find({
          assignees: userObjId,
          status: { $nin: ['DONE'] },
          $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
        })
          .sort({ dueDate: 1, priority: -1, createdAt: -1 })
          .limit(8)
          .populate('project', 'name')
          .lean<TaskLean[]>(),
        TaskModel.countDocuments({
          assignees: userObjId,
          status: { $nin: ['DONE'] },
          $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
        }),
        TaskModel.countDocuments({
          assignees: userObjId,
          status: { $nin: ['DONE'] },
          dueDate: { $lt: now },
          $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
        }),
      ]);

    // 4) Activity log across all my teams (newest first).
    const activityDocs = await ActivityLogModel.find({
      team: { $in: teamIds },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('actor', 'name avatarUrl')
      .lean<ActivityLean[]>();

    return {
      stats: {
        totalTeams: teamIds.length,
        totalProjects,
        activeProjects,
        openTasksAssignedToMe: openTasksTotal,
        overdueTasksAssignedToMe,
      },
      recentProjects: recentProjectDocs.map((p) => {
        const team = p.team as { _id?: Types.ObjectId; name?: string } | null;
        return {
          _id: p._id.toString(),
          name: p.name,
          slug: p.slug,
          status: p.status,
          color: p.color ?? '#3B82F6',
          teamId: safeStr(team?._id),
          teamName: team?.name ?? null,
          updatedAt: p.updatedAt?.toISOString() ?? new Date().toISOString(),
        };
      }),
      myOpenTasks: openTaskDocs.map((t) => {
        const proj = t.project as { _id?: Types.ObjectId; name?: string } | null;
        const due = t.dueDate ?? null;
        return {
          _id: t._id.toString(),
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: due ? due.toISOString() : null,
          projectId: safeStr(proj?._id),
          projectName: proj?.name ?? null,
          overdue: due ? due.getTime() < now.getTime() : false,
        };
      }),
      recentActivity: activityDocs.map((a) => ({
        _id: a._id.toString(),
        type: a.type,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
        actor: a.actor
          ? {
              _id: safeStr(a.actor._id),
              name: a.actor.name ?? 'Alguien',
              avatarUrl: a.actor.avatarUrl,
            }
          : undefined,
        projectId: a.project ? safeStr(a.project) : null,
        teamId: a.team ? safeStr(a.team) : null,
      })),
    };
  },

  /**
   * Create a tiny but realistic playground for a fresh user:
   *
   *   - A team named "{firstName}'s Lab" on the FREE plan, with the
   *     calling user as OWNER.
   *   - A "DevHub Demo" project under it.
   *   - Five sample tasks across the kanban columns so the dashboard,
   *     the project overview and the board immediately have something
   *     to render.
   *
   * Idempotent-ish: if the user already has any team membership, we
   * refuse with 409 so they don't accumulate clutter. The frontend can
   * read that error and route them to the existing team instead.
   */
  async seedDemoData(
    userId: string,
    userName: string,
  ): Promise<{ teamId: string; projectId: string; tasksCreated: number }> {
    const userObjId = new Types.ObjectId(userId);

    // Guard: don't pile up demo data on top of an existing workspace.
    const existing = await TeamMemberModel.countDocuments({
      user: userObjId,
      status: 'ACTIVE',
    });
    if (existing > 0) {
      throw new ConflictError(
        'Ya tienes equipos. La creación de datos demo solo está disponible para cuentas vacías.',
      );
    }

    const firstName = (userName ?? 'Mi').trim().split(/\s+/)[0] || 'Mi';
    const teamName = `${firstName}'s Lab`;
    const baseSlug = slugify(teamName) || 'demo';

    // Slug uniqueness: try the base, then numbered suffixes.
    let slug = baseSlug;
    let suffix = 1;
    while (await TeamModel.exists({ slug })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
      if (suffix > 30) {
        throw new ConflictError('No pude generar un slug único para el equipo demo.');
      }
    }

    const team = await TeamModel.create({
      name: teamName,
      slug,
      owner: userObjId,
      plan: 'FREE',
    });

    await TeamMemberModel.create({
      team: team._id,
      user: userObjId,
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

    const project: ProjectDocument = await ProjectModel.create({
      team: team._id,
      name: 'DevHub Demo',
      slug: 'devhub-demo',
      description:
        'Proyecto de ejemplo creado por el botón "Crear datos demo" del dashboard. ' +
        'Bórralo cuando ya no lo necesites.',
      status: 'DEVELOPMENT',
      stack: ['Angular', 'Express', 'MongoDB'],
      color: '#3B82F6',
      createdBy: userObjId,
      members: [userObjId],
    });

    // Sample tasks across the kanban columns.
    const demoTasks: Array<{
      title: string;
      status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'BLOCKED' | 'DONE';
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
      description?: string;
      dueInDays?: number;
    }> = [
      { title: 'Definir el alcance del proyecto', status: 'DONE',        priority: 'HIGH'   },
      { title: 'Pintar wireframes principales',   status: 'REVIEW',      priority: 'MEDIUM' },
      { title: 'Implementar autenticación',       status: 'IN_PROGRESS', priority: 'HIGH', dueInDays: 5 },
      { title: 'Conectar repositorio de GitHub',  status: 'TODO',        priority: 'MEDIUM' },
      { title: 'Configurar primer deploy a Vercel', status: 'TODO',      priority: 'URGENT', dueInDays: 3 },
    ];

    const created = await Promise.all(
      demoTasks.map((t) =>
        TaskModel.create({
          project: project._id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          assignees: [userObjId],
          createdBy: userObjId,
          dueDate: t.dueInDays
            ? new Date(Date.now() + t.dueInDays * 24 * 60 * 60 * 1000)
            : undefined,
        }),
      ),
    );

    // Best-effort activity entries so the dashboard has something to show.
    await Promise.allSettled([
      activityService.logTeamCreated(team._id, userObjId, team.name),
      activityService.logProjectCreated(team._id, project._id, userObjId, project.name),
      ...created.map((task) =>
        activityService.logTaskCreated(team._id, project._id, userObjId, task.title),
      ),
    ]);

    return {
      teamId: team._id.toString(),
      projectId: project._id.toString(),
      tasksCreated: created.length,
    };
  },
};
