export const TEAM_ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  DEVELOPER: 'DEVELOPER',
  VIEWER: 'VIEWER',
} as const;

export type TeamRole = (typeof TEAM_ROLES)[keyof typeof TEAM_ROLES];

export const TEAM_ROLE_VALUES: TeamRole[] = Object.values(TEAM_ROLES);

export const TEAM_MEMBER_STATUS = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  REJECTED: 'REJECTED',
} as const;

export type TeamMemberStatus =
  (typeof TEAM_MEMBER_STATUS)[keyof typeof TEAM_MEMBER_STATUS];

export const TEAM_MEMBER_STATUS_VALUES: TeamMemberStatus[] = Object.values(
  TEAM_MEMBER_STATUS,
);
