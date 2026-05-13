import { z } from 'zod';
import { PROJECT_STATUS_VALUES } from '../../shared/constants/project-status';

const projectStatusEnum = z.enum(
  PROJECT_STATUS_VALUES as [string, ...string[]],
);

export const createProjectSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  stack: z.array(z.string()).optional(),
  status: projectStatusEnum.optional(),
  dueDate: z
    .string()
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date')
    .optional(),
  repositoryUrl: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  color: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
