import { z } from 'zod';

/**
 * GitHub `owner/repo`: owner is alphanumerics/hyphens (no leading/trailing
 * hyphen), repo allows alphanumerics, `-`, `_` and `.`.
 */
const OWNER_REPO_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]{1,100}$/;

const repoFullName = z
  .string()
  .trim()
  .regex(OWNER_REPO_REGEX, 'Debe tener formato owner/repo');

/** Same flexible-date style used by tasks/projects: ISO-parseable string. */
const flexibleDate = z
  .string()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Invalid date');

export const createClassroomSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
}).strict();

export const updateClassroomSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  archived: z.boolean().optional(),
}).strict();

export const joinClassroomSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .length(8)
    .regex(/^[A-Za-z0-9]+$/, 'Código inválido')
    .transform((v) => v.toUpperCase()),
}).strict();

export const createAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().max(20000).optional(),
  templateRepoFullName: repoFullName.optional(),
  dueAt: flexibleDate.optional(),
}).strict();

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().max(20000).optional(),
  templateRepoFullName: repoFullName.optional(),
  dueAt: flexibleDate.optional(),
}).strict();

export const submitAssignmentSchema = z.object({
  repoFullName,
}).strict();

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
export type JoinClassroomInput = z.infer<typeof joinClassroomSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
