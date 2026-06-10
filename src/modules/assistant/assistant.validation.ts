import { z } from 'zod';

/**
 * Request schema for `POST /api/assistant/chat`.
 *
 * Constraints:
 *  - `message` is mandatory and bounded so a buggy client can't ship a
 *    50 KB string to the LLM.
 *  - `history` is optional and capped at 8 turns to keep the prompt small
 *    (DeepSeek bills per input token).
 *  - `context` exposes purely cosmetic hints — current route, role,
 *    project name — that help the model give grounded answers. We do not
 *    accept arbitrary keys; the object is strict.
 */
export const chatSchema = z
  .object({
    message: z.string().trim().min(1, 'message cannot be empty').max(1000),
    history: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            text: z.string().max(2000),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    context: z
      .object({
        route: z.string().max(200).optional(),
        role: z.enum(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']).nullable().optional(),
        projectName: z.string().max(120).optional(),
        teamName: z.string().max(120).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ChatInput = z.infer<typeof chatSchema>;
