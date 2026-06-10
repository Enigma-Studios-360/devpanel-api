import { z } from 'zod';
import { PLAN_VALUES } from '../../shared/constants/plans';

export const simulateUpgradeSchema = z.object({
  plan: z.enum(PLAN_VALUES as [string, ...string[]]),
}).strict();

export type SimulateUpgradeInput = z.infer<typeof simulateUpgradeSchema>;
