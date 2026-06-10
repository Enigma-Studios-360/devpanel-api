import { z } from 'zod';

export const linkRepoSchema = z.object({
  /** owner/repo, https URL or git SSH URL. Service validates and parses. */
  input: z.string().min(3).max(300),
}).strict();

export const createIssueSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(20000).optional(),
}).strict();

export const listIssuesQuerySchema = z.object({
  state: z.enum(['open', 'closed', 'all']).optional(),
}).strict();

export type LinkRepoInput = z.infer<typeof linkRepoSchema>;
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
