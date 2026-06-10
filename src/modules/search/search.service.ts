import { Types } from 'mongoose';
import { TeamMemberModel } from '../teams/team-member.model';
import { TeamModel } from '../teams/team.model';
import { ProjectModel } from '../projects/project.model';
import { TaskModel } from '../tasks/task.model';

/**
 * Global "command palette" search. Scoped to the caller's data: we only
 * ever look inside teams where the user has an ACTIVE membership, so the
 * results can never leak another tenant's teams/projects/tasks.
 */
export interface SearchResults {
  query: string;
  teams: Array<{ _id: string; name: string; slug: string }>;
  projects: Array<{ _id: string; name: string; teamId: string; status: string }>;
  tasks: Array<{ _id: string; title: string; projectId: string; status: string }>;
}

/** Escape user input before using it in a RegExp (avoid ReDoS / injection). */
const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMPTY = (query: string): SearchResults => ({ query, teams: [], projects: [], tasks: [] });

export const searchService = {
  async search(userId: string, rawQuery: string): Promise<SearchResults> {
    const query = (rawQuery ?? '').trim();
    if (query.length < 2) return EMPTY(query);

    const userObjId = new Types.ObjectId(userId);
    const memberships = await TeamMemberModel.find({ user: userObjId, status: 'ACTIVE' })
      .select('team')
      .lean();
    const teamIds = memberships.map((m) => m.team);
    if (teamIds.length === 0) return EMPTY(query);

    const rx = new RegExp(escapeRegex(query), 'i');

    // All projects the user can reach (used to scope task search too).
    const accessibleProjects = await ProjectModel.find({ team: { $in: teamIds } })
      .select('_id name team status archivedAt')
      .lean();
    const projectIds = accessibleProjects.map((p) => p._id);

    const [teams, tasks] = await Promise.all([
      TeamModel.find({ _id: { $in: teamIds }, name: rx }).select('name slug').limit(5).lean(),
      projectIds.length
        ? TaskModel.find({ project: { $in: projectIds }, archivedAt: null, title: rx })
            .select('title project status')
            .limit(8)
            .lean()
        : Promise.resolve([] as Array<{ _id: Types.ObjectId; title: string; project: Types.ObjectId; status: string }>),
    ]);

    const projects = accessibleProjects
      .filter((p) => p.status !== 'ARCHIVED' && (rx.test(p.name) || false))
      .slice(0, 8);

    return {
      query,
      teams: teams.map((t) => ({ _id: String(t._id), name: t.name, slug: t.slug })),
      projects: projects.map((p) => ({
        _id: String(p._id),
        name: p.name,
        teamId: String(p.team),
        status: p.status,
      })),
      tasks: tasks.map((t) => ({
        _id: String(t._id),
        title: t.title,
        projectId: String(t.project),
        status: t.status,
      })),
    };
  },
};
