import { z } from 'zod';
import { DOC_SECTION_KEYS } from './project-doc.model';

const sectionPatch = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(20000).optional(),
  completed: z.boolean().optional(),
}).strict();

const sectionsObject = z.object(
  DOC_SECTION_KEYS.reduce<Record<string, typeof sectionPatch>>((acc, key) => {
    acc[key] = sectionPatch;
    return acc;
  }, {}),
).strict().partial();

export const updateDocSchema = z.object({
  sections: sectionsObject.optional(),
}).strict();

export type UpdateDocInput = z.infer<typeof updateDocSchema>;
