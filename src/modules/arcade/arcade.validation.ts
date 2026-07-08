import { z } from 'zod';

export const reportProgressSchema = z.object({
  game: z.string().min(1).max(40).optional(),
  day: z.number().int().min(1).max(999),
  totalStars: z.number().int().min(0).max(100000),
  money: z.number().min(0).max(10000000),
  rank: z.string().max(60).optional(),
  ticketsResolved: z.number().int().min(0).max(100000),
  ticketsLost: z.number().int().min(0).max(100000).optional(),
}).strict();

export type ReportProgressInput = z.infer<typeof reportProgressSchema>;
