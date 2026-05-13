export const PROJECT_STATUS = {
  PLANNING: 'PLANNING',
  DEVELOPMENT: 'DEVELOPMENT',
  TESTING: 'TESTING',
  PRODUCTION: 'PRODUCTION',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ProjectStatus =
  (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_VALUES: ProjectStatus[] =
  Object.values(PROJECT_STATUS);
