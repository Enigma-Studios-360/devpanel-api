import type { TeamRole } from '../constants/roles';

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  // Filled in by team-scoped middleware in future phases
  teamId?: string;
  teamRole?: TeamRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
