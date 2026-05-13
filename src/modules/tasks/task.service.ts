import { Types } from 'mongoose';
import { TaskModel, type TaskDocument } from './task.model';
import { TaskCommentModel } from './task-comment.model';
import { ProjectModel } from '../projects/project.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { activityService } from '../activity/activity.service';
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

  async listByProject(projectId: string): Promise<TaskDocument[]> {
    return TaskModel.find({ project: new Types.ObjectId(projectId) })
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
    return comment.populate('user', 'name email avatarUrl');
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

    const [counts, overdueTasks] = await Promise.all([
      TaskModel.aggregate<{ _id: TaskStatus; total: number }>([
        { $match: { project: projectObjId } },
        { $group: { _id: '$status', total: { $sum: 1 } } },
      ]),
      TaskModel.countDocuments({
        project: projectObjId,
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
