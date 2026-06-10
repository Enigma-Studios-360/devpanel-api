import { Types } from 'mongoose';
import { TaskModel, type TaskDocument } from './task.model';
import { TaskCommentModel } from './task-comment.model';
import { ProjectModel } from '../projects/project.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { UserModel } from '../users/user.model';
import { activityService } from '../activity/activity.service';
import { notificationService } from '../notifications/notification.service';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/http-errors';
import type { TaskStatus, TaskPriority } from '../../shared/constants/task-status';

interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignees?: string[];
  dueDate?: string;
}

interface UpdateTaskInput extends Partial<Omit<CreateTaskInput, 'status'>> {}

interface TaskAccess {
  task: TaskDocument;
  projectId: Types.ObjectId;
  teamId: Types.ObjectId;
}

const toObjectIds = (ids: string[]): Types.ObjectId[] =>
  ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

/**
 * Validate every assignee belongs to the project's team (ACTIVE membership).
 * In Phase 4 we'll restrict to project members specifically.
 */
const validateAssignees = async (
  teamId: Types.ObjectId,
  assigneeIds: string[],
): Promise<Types.ObjectId[]> => {
  if (!assigneeIds || assigneeIds.length === 0) return [];
  const objectIds = toObjectIds(assigneeIds);
  if (objectIds.length !== assigneeIds.length) {
    throw new BadRequestError('Some assignee ids are invalid');
  }
  const memberCount = await TeamMemberModel.countDocuments({
    team: teamId,
    user: { $in: objectIds },
    status: 'ACTIVE',
  });
  if (memberCount !== objectIds.length) {
    throw new BadRequestError(
      'All assignees must be active members of the project team',
    );
  }
  return objectIds;
};

/**
 * Fire "task assigned" notifications for the people who just became
 * assignees. Compares the new list against `previous` (string ids) so
 * we only ping users who weren't already on the task — re-saving a
 * task shouldn't spam its long-time assignees.
 *
 * Excludes `actorId` so you never notify yourself for assigning a task
 * to yourself.
 */
const notifyAssignees = async (
  task: TaskDocument,
  newAssignees: Types.ObjectId[],
  previous: string[],
  actorId: string,
  teamId: Types.ObjectId,
): Promise<void> => {
  const prevSet = new Set(previous);
  const added = newAssignees
    .map((id) => id.toString())
    .filter((id) => !prevSet.has(id));
  if (added.length === 0) return;
  await notificationService.createForMany(
    added,
    {
      type: 'TASK_ASSIGNED',
      title: `Te asignaron "${task.title}"`,
      message: `Prioridad ${task.priority} · ${task.status}`,
      team: teamId,
      project: task.project,
      action: {
        label: 'Abrir tarea',
        url: `/app/projects/${task.project.toString()}/tasks`,
      },
      metadata: { taskId: task._id.toString() },
    },
    actorId,
  );
};

const assertProjectAccess = async (
  projectId: string,
  userId: string,
): Promise<{ projectId: Types.ObjectId; teamId: Types.ObjectId }> => {
  if (!Types.ObjectId.isValid(projectId)) {
    throw new BadRequestError('Invalid project id');
  }
  const project = await ProjectModel.findById(projectId).select('_id team members');
  if (!project) throw new NotFoundError('Project not found');

  const userObjId = new Types.ObjectId(userId);
  const isProjectMember = project.members.some((m) => m.toString() === userId);
  if (!isProjectMember) {
    const teamMember = await TeamMemberModel.findOne({
      team: project.team,
      user: userObjId,
      status: 'ACTIVE',
    }).lean();
    if (!teamMember) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return { projectId: project._id, teamId: project.team };
};

const assertTaskAccess = async (
  taskId: string,
  userId: string,
): Promise<TaskAccess> => {
  if (!Types.ObjectId.isValid(taskId)) {
    throw new BadRequestError('Invalid task id');
  }
  const task = await TaskModel.findById(taskId);
  if (!task) throw new NotFoundError('Task not found');
  const { projectId, teamId } = await assertProjectAccess(
    task.project.toString(),
    userId,
  );
  return { task, projectId, teamId };
};

export const taskService = {
  assertProjectAccess,
  assertTaskAccess,

  async listByProject(
    projectId: string,
    options: { includeArchived?: boolean; archivedOnly?: boolean } = {},
  ): Promise<TaskDocument[]> {
    const filter: Record<string, unknown> = {
      project: new Types.ObjectId(projectId),
    };
    if (options.archivedOnly) {
      filter['archivedAt'] = { $ne: null };
    } else if (!options.includeArchived) {
      // Default: only active tasks. Old documents missing the field are
      // treated as active too (no $exists check needed because the schema
      // now defaults the field to null).
      filter['$or'] = [
        { archivedAt: null },
        { archivedAt: { $exists: false } },
      ];
    }
    return TaskModel.find(filter)
      .sort({ status: 1, priority: -1, createdAt: -1 })
      .populate('assignees', 'name email avatarUrl');
  },

  async create(
    projectId: string,
    actorId: string,
    input: CreateTaskInput,
  ): Promise<TaskDocument> {
    const { teamId } = await assertProjectAccess(projectId, actorId);
    const assignees = await validateAssignees(teamId, input.assignees ?? []);

    const task = await TaskModel.create({
      project: new Types.ObjectId(projectId),
      title: input.title.trim(),
      description: input.description,
      status: input.status ?? 'TODO',
      priority: input.priority ?? 'MEDIUM',
      assignees,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      createdBy: new Types.ObjectId(actorId),
    });

    await activityService.logTaskCreated(teamId, task.project, actorId, task.title);
    // Notify every initial assignee except the creator themselves.
    await notifyAssignees(task, assignees, [], actorId, teamId);
    return task;
  },

  async getById(taskId: string, userId: string): Promise<TaskDocument> {
    const { task } = await assertTaskAccess(taskId, userId);
    await task.populate('assignees', 'name email avatarUrl');
    await task.populate('createdBy', 'name email avatarUrl');
    return task;
  },

  async update(
    taskId: string,
    userId: string,
    input: UpdateTaskInput,
  ): Promise<TaskDocument> {
    const { task, teamId } = await assertTaskAccess(taskId, userId);

    // Remember the prior assignee list so we can fan-out notifications
    // only to people who are NEWLY assigned, not the whole list each save.
    const previousAssignees = task.assignees.map((id) => id.toString());

    if (input.title !== undefined) task.title = input.title.trim();
    if (input.description !== undefined) task.description = input.description;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.dueDate !== undefined) {
      task.dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    }
    if (input.assignees !== undefined) {
      task.assignees = await validateAssignees(teamId, input.assignees);
    }

    await task.save();
    await activityService.logTaskUpdated(teamId, task.project, userId, task.title);

    if (input.assignees !== undefined) {
      await notifyAssignees(task, task.assignees, previousAssignees, userId, teamId);
    }
    return task;
  },

  async changeStatus(
    taskId: string,
    userId: string,
    nextStatus: TaskStatus,
  ): Promise<TaskDocument> {
    const { task, teamId } = await assertTaskAccess(taskId, userId);

    const previous = task.status;
    if (previous === nextStatus) return task;

    task.status = nextStatus;
    await task.save();
    await activityService.logTaskStatusChanged(
      teamId,
      task.project,
      userId,
      task.title,
      previous,
      nextStatus,
    );
    return task;
  },

  // Comments -----------------------------------------------------------------

  async listComments(taskId: string, userId: string): Promise<unknown[]> {
    await assertTaskAccess(taskId, userId);
    return TaskCommentModel.find({ task: new Types.ObjectId(taskId) })
      .sort({ createdAt: 1 })
      .populate('user', 'name email avatarUrl')
      .lean();
  },

  async addComment(
    taskId: string,
    userId: string,
    message: string,
  ): Promise<unknown> {
    const { task, teamId } = await assertTaskAccess(taskId, userId);
    const comment = await TaskCommentModel.create({
      task: task._id,
      user: new Types.ObjectId(userId),
      message: message.trim(),
    });
    await activityService.logTaskCommentCreated(
      teamId,
      task.project,
      userId,
      task.title,
    );

    // Notify the task creator (skip if commenter == creator). We also
    // include assignees so the people working on the task see new
    // comments without having to keep the drawer open.
    const recipients = new Set<string>();
    if (task.createdBy) recipients.add(task.createdBy.toString());
    for (const a of task.assignees) recipients.add(a.toString());
    const commenter = await UserModel.findById(userId).select('name').lean();
    const commenterName = commenter?.name ?? 'Alguien';
    await notificationService.createForMany(
      Array.from(recipients),
      {
        type: 'TASK_COMMENT',
        title: `${commenterName} comentó "${task.title}"`,
        message:
          message.length > 140 ? message.slice(0, 137) + '…' : message,
        team: teamId,
        project: task.project,
        action: {
          label: 'Ver tarea',
          url: `/app/projects/${task.project.toString()}/tasks`,
        },
        metadata: { taskId: task._id.toString() },
      },
      userId, // never notify yourself about your own comment
    );

    return comment.populate('user', 'name email avatarUrl');
  },

  // Archive / restore / delete ----------------------------------------------

  async archive(taskId: string, userId: string): Promise<TaskDocument> {
    const { task, teamId } = await assertTaskAccess(taskId, userId);
    if (task.archivedAt) return task;
    task.archivedAt = new Date();
    await task.save();
    await activityService.logTaskArchived(teamId, task.project, userId, task.title);
    return task;
  },

  async restore(taskId: string, userId: string): Promise<TaskDocument> {
    const { task } = await assertTaskAccess(taskId, userId);
    if (!task.archivedAt) return task;
    task.archivedAt = null;
    await task.save();
    return task;
  },

  async delete(
    taskId: string,
    userId: string,
  ): Promise<{ deleted: true; _id: string }> {
    const { task, teamId } = await assertTaskAccess(taskId, userId);
    const title = task.title;
    const projectId = task.project;
    // Hard delete: remove the task and its comments. Activity log entries
    // referencing this task stay (they document history).
    await Promise.all([
      task.deleteOne(),
      TaskCommentModel.deleteMany({ task: task._id }),
    ]);
    await activityService.logTaskDeleted(teamId, projectId, userId, title);
    return { deleted: true, _id: taskId };
  },

  // Metrics for dashboard ----------------------------------------------------

  async metricsForProject(projectId: string): Promise<{
    totalTasks: number;
    todoTasks: number;
    inProgressTasks: number;
    reviewTasks: number;
    blockedTasks: number;
    completedTasks: number;
    overdueTasks: number;
  }> {
    const projectObjId = new Types.ObjectId(projectId);
    const now = new Date();
    // Metrics ignore archived tasks — they're hidden from the board too.
    const activeFilter = {
      project: projectObjId,
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    };

    const [counts, overdueTasks] = await Promise.all([
      TaskModel.aggregate<{ _id: TaskStatus; total: number }>([
        { $match: activeFilter },
        { $group: { _id: '$status', total: { $sum: 1 } } },
      ]),
      TaskModel.countDocuments({
        ...activeFilter,
        dueDate: { $lt: now },
        status: { $nin: ['DONE'] },
      }),
    ]);

    const map = new Map(counts.map((c) => [c._id, c.total]));
    const todo = map.get('TODO') ?? 0;
    const inProgress = map.get('IN_PROGRESS') ?? 0;
    const review = map.get('REVIEW') ?? 0;
    const blocked = map.get('BLOCKED') ?? 0;
    const done = map.get('DONE') ?? 0;

    return {
      totalTasks: todo + inProgress + review + blocked + done,
      todoTasks: todo,
      inProgressTasks: inProgress,
      reviewTasks: review,
      blockedTasks: blocked,
      completedTasks: done,
      overdueTasks,
    };
  },
};
