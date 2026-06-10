import { z } from 'zod';

const FRAMEWORK_VALUES = [
  'nextjs',
  'angular',
  'vite',
  'create-react-app',
  'nuxtjs',
  'astro',
  'sveltekit',
  'remix',
  'gatsby',
  'vue',
  'svelte',
  'hugo',
  'jekyll',
  'eleventy',
  'docusaurus',
  'other',
] as const;

/**
 * Single env var pair as the Vercel API expects. Both key and value are
 * required when present so we never push an empty string by accident.
 */
const envVarSchema = z
  .object({
    key: z.string().trim().min(1).max(256),
    value: z.string().max(64 * 1024), // 64KB matches Vercel's limit
  })
  .strict();

export const triggerDeploySchema = z
  .object({
    projectName: z.string().trim().min(1).max(100).optional(),
    framework: z.enum(FRAMEWORK_VALUES),
    buildCommand: z.string().max(500).optional(),
    outputDirectory: z.string().max(200).optional(),
    installCommand: z.string().max(500).optional(),
    rootDirectory: z.string().max(200).optional(),
    branch: z.string().trim().min(1).max(200).optional(),
    envVars: z.array(envVarSchema).max(50).optional(),
  })
  .strict();

export type TriggerDeployInputDto = z.infer<typeof triggerDeploySchema>;
