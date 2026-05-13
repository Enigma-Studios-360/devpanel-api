import { z } from 'zod';
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from '../../shared/constants/task-status';

const taskStatusEnum = z.enum(TASK_STATUS_VALUES as [string, ...string[]]);
const taskPriorityEnum = z.enum(TASK_PRIORITY_VALUES as [string, ...string[]]);

const flexibleDate = z
  .string()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date')
  .optional();

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assignees: z.array(z.string()).optional(),
  dueDate: flexibleDate,
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: taskPriorityEnum.optional(),
  assignees: z.array(z.string()).optional(),
  dueDate: flexibleDate,
});

export const updateTaskStatusSchema = z.object({
  status: taskStatusEnum,
});

export const createTaskCommentSchema = z.object({
  message: z.string().min(1).max(5000),
});
