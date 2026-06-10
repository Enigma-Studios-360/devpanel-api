/* eslint-disable no-console */
/**
 * Seed script — creates demo users with every role, a realistic STARTER
 * team ("DevHub Demo") with three projects connected to real public GitHub
 * repos and a Kanban full of tasks, plus a FREE solo team to demo the plan
 * limit. Idempotent: re-running never duplicates data nor overwrites
 * existing passwords.
 *
 * Run with:  npm run db:seed   (or, for a clean wipe first: npm run db:reset -- --yes)
 */

import bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel, type UserDocument } from '../modules/users/user.model';
import { TeamModel, type TeamDocument } from '../modules/teams/team.model';
import { TeamMemberModel } from '../modules/teams/team-member.model';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { ProjectModel, type ProjectDocument } from '../modules/projects/project.model';
import { TaskModel } from '../modules/tasks/task.model';
import { ActivityLogModel } from '../modules/activity/activity.model';
import { PLAN_LIMITS, type PlanCode } from '../shared/constants/plans';
import type { TeamRole } from '../shared/constants/roles';
import type { ProjectStatus } from '../shared/constants/project-status';
import type { TaskStatus, TaskPriority } from '../shared/constants/task-status';

const SHARED_PASSWORD = 'password123';
const SALT_ROUNDS = 10;

interface SeedUser {
  name: string;
  email: string;
}

interface SeedMembership {
  email: string;
  role: TeamRole;
}

interface SeedTask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Email of the user to assign (optional). */
  assignee?: string;
  /** Days from now for the due date (optional). */
  dueInDays?: number;
}

interface SeedProject {
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  stack: string[];
  /** Real public GitHub repo to "connect" so the GitHub tab shows live data. */
  github?: { owner: string; repo: string; defaultBranch?: string };
  tasks?: SeedTask[];
}

const USERS: SeedUser[] = [
  { name: 'Olivia Owner',     email: 'owner@devpanel.dev' },
  { name: 'Adam Admin',       email: 'admin@devpanel.dev' },
  { name: 'Diego Developer',  email: 'dev@devpanel.dev' },
  { name: 'Vera Viewer',      email: 'viewer@devpanel.dev' },
  // Outsider — useful for testing 403 cross-team access.
  { name: 'Erika External',   email: 'outsider@devpanel.dev' },
];

const DEMO_TEAM = {
  name: 'DevHub Demo',
  slug: 'devhub-demo',
  plan: 'STARTER' as PlanCode,
};

const DEMO_MEMBERSHIPS: SeedMembership[] = [
  { email: 'owner@devpanel.dev',  role: 'OWNER' },
  { email: 'admin@devpanel.dev',  role: 'ADMIN' },
  { email: 'dev@devpanel.dev',    role: 'DEVELOPER' },
  { email: 'viewer@devpanel.dev', role: 'VIEWER' },
];

const DEMO_PROJECTS: SeedProject[] = [
  {
    name: 'DevHub Web',
    slug: 'devhub-web',
    description: 'Frontend Angular 21 + PrimeNG: dashboard, Kanban, docs, GitHub y deploy.',
    status: 'DEVELOPMENT',
    stack: ['Angular', 'TypeScript', 'PrimeNG', 'SCSS'],
    github: { owner: 'angular', repo: 'components', defaultBranch: 'main' },
    tasks: [
      { title: 'Arreglar z-index del tutorial sobre los modales', description: 'El overlay tapaba el modal de crear equipo.', status: 'DONE', priority: 'HIGH', assignee: 'dev@devpanel.dev' },
      { title: 'Sidebar contextual por proyecto', description: 'Mostrar Tareas/Docs/GitHub/Deploy del proyecto activo.', status: 'DONE', priority: 'MEDIUM', assignee: 'admin@devpanel.dev' },
      { title: 'Montar Clippy a nivel raíz', description: 'Que el asistente se vea en landing y auth, no solo en /app.', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'dev@devpanel.dev' },
      { title: 'Breadcrumbs en vistas de proyecto', status: 'TODO', priority: 'LOW' },
      { title: 'Buscador global con ⌘K', description: 'Hoy el input del topbar es decorativo.', status: 'TODO', priority: 'MEDIUM' },
      { title: 'Revisar contraste del tema claro', status: 'REVIEW', priority: 'LOW', assignee: 'viewer@devpanel.dev' },
    ],
  },
  {
    name: 'DevHub API',
    slug: 'devhub-api',
    description: 'Backend Express 5 + MongoDB: auth con roles, proyectos, tareas, GitHub y Vercel.',
    status: 'TESTING',
    stack: ['Express', 'TypeScript', 'MongoDB', 'Zod'],
    github: { owner: 'expressjs', repo: 'express', defaultBranch: 'master' },
    tasks: [
      { title: 'Validar variables de entorno con Zod al arrancar', description: 'Evitar arrancar con JWT_SECRET débil.', status: 'TODO', priority: 'HIGH', assignee: 'admin@devpanel.dev' },
      { title: 'Implementar módulo de archivos (uploads)', description: 'Multer ya está configurado; falta cablear las rutas.', status: 'TODO', priority: 'MEDIUM' },
      { title: 'Endpoint de reorden de tareas (campo order)', description: 'Persistir el orden intra-columna del Kanban.', status: 'BLOCKED', priority: 'MEDIUM', assignee: 'dev@devpanel.dev' },
      { title: 'Hooks de notificación en deploy', status: 'DONE', priority: 'MEDIUM' },
      { title: 'Rate limit del asistente por usuario', status: 'DONE', priority: 'LOW' },
      { title: 'Paginación en commits/branches de GitHub', status: 'IN_PROGRESS', priority: 'LOW', assignee: 'dev@devpanel.dev' },
    ],
  },
  {
    name: 'Deploy Bot',
    slug: 'deploy-bot',
    description: 'Integración con la API de Vercel para el Deploy Wizard de 4 pasos.',
    status: 'PLANNING',
    stack: ['Node.js', 'Vercel API'],
    github: { owner: 'vercel', repo: 'vercel', defaultBranch: 'main' },
    tasks: [
      { title: 'Botón "Reintentar deploy"', description: 'Hoy hay que lanzar uno nuevo desde cero.', status: 'TODO', priority: 'MEDIUM' },
      { title: 'Pausar polling con Page Visibility API', status: 'TODO', priority: 'LOW' },
      { title: 'Mostrar logs del build en la app', status: 'TODO', priority: 'LOW' },
    ],
  },
];

const FREE_TEAM = {
  name: 'Free Tier Demo',
  slug: 'free-tier-demo',
  plan: 'FREE' as PlanCode,
};

const FREE_PROJECT: SeedProject = {
  name: 'Portfolio personal',
  slug: 'portfolio-personal',
  description: 'Proyecto en plan FREE — sirve para demostrar el límite de 1 proyecto activo.',
  status: 'PLANNING',
  stack: ['Astro', 'Tailwind'],
  github: { owner: 'withastro', repo: 'astro', defaultBranch: 'main' },
  tasks: [
    { title: 'Diseñar la home', status: 'TODO', priority: 'MEDIUM' },
    { title: 'Conectar formulario de contacto', status: 'TODO', priority: 'LOW' },
  ],
};

// ---------------------------------------------------------------------------

interface UpsertResult {
  doc: UserDocument;
  state: 'created' | 'repaired-hash' | 'unchanged';
}

const isValidHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 20;

const upsertUser = async (seed: SeedUser): Promise<UpsertResult> => {
  const existing = await UserModel.findOne({ email: seed.email });
  if (existing) {
    if (!isValidHash(existing.passwordHash)) {
      existing.passwordHash = await bcrypt.hash(SHARED_PASSWORD, SALT_ROUNDS);
      if (!existing.status) existing.status = 'ACTIVE';
      if (!existing.name) existing.name = seed.name;
      await existing.save();
      return { doc: existing, state: 'repaired-hash' };
    }
    return { doc: existing, state: 'unchanged' };
  }
  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, SALT_ROUNDS);
  const doc = await UserModel.create({
    name: seed.name,
    email: seed.email,
    passwordHash,
    status: 'ACTIVE',
  });
  return { doc, state: 'created' };
};

const upsertTeam = async (
  config: { name: string; slug: string; plan: PlanCode },
  ownerId: Types.ObjectId,
): Promise<TeamDocument> => {
  const existing = await TeamModel.findOne({ slug: config.slug });
  if (existing) {
    if (existing.plan !== config.plan) {
      existing.plan = config.plan;
      await existing.save();
    }
    return existing;
  }
  return TeamModel.create({
    name: config.name,
    slug: config.slug,
    owner: ownerId,
    plan: config.plan,
  });
};

const upsertMembership = async (
  teamId: Types.ObjectId,
  userId: Types.ObjectId,
  role: TeamRole,
): Promise<void> => {
  const existing = await TeamMemberModel.findOne({ team: teamId, user: userId });
  if (!existing) {
    await TeamMemberModel.create({
      team: teamId,
      user: userId,
      role,
      status: 'ACTIVE',
      joinedAt: new Date(),
    });
    return;
  }
  if (existing.role !== role || existing.status !== 'ACTIVE') {
    existing.role = role;
    existing.status = 'ACTIVE';
    if (!existing.joinedAt) existing.joinedAt = new Date();
    await existing.save();
  }
};

const upsertSubscription = async (
  teamId: Types.ObjectId,
  plan: PlanCode,
): Promise<void> => {
  const existing = await SubscriptionModel.findOne({ team: teamId });
  if (!existing) {
    await SubscriptionModel.create({
      team: teamId,
      plan,
      status: 'ACTIVE',
      limits: PLAN_LIMITS[plan],
    });
    return;
  }
  if (existing.plan !== plan) {
    existing.plan = plan;
    existing.limits = PLAN_LIMITS[plan];
    existing.status = 'ACTIVE';
    await existing.save();
  }
};

const upsertProject = async (
  teamId: Types.ObjectId,
  ownerId: Types.ObjectId,
  seed: SeedProject,
): Promise<ProjectDocument> => {
  const existing = await ProjectModel.findOne({ team: teamId, slug: seed.slug });
  if (existing) return existing;
  return ProjectModel.create({
    team: teamId,
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    status: seed.status,
    stack: seed.stack,
    members: [ownerId],
    createdBy: ownerId,
    color: '#3B82F6',
    repositoryUrl: seed.github
      ? `https://github.com/${seed.github.owner}/${seed.github.repo}`
      : undefined,
    githubOwner: seed.github?.owner,
    githubRepo: seed.github?.repo,
    defaultBranch: seed.github?.defaultBranch ?? 'main',
  });
};

/** Seed tasks for a project — idempotent (skips if the project already has any). */
const seedTasks = async (
  project: ProjectDocument,
  tasks: SeedTask[] | undefined,
  createdBy: Types.ObjectId,
  usersByEmail: Map<string, UserDocument>,
): Promise<number> => {
  if (!tasks || tasks.length === 0) return 0;
  const existing = await TaskModel.countDocuments({ project: project._id });
  if (existing > 0) return 0;
  const docs = tasks.map((t) => ({
    project: project._id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    createdBy,
    assignees: t.assignee && usersByEmail.get(t.assignee)
      ? [usersByEmail.get(t.assignee)!._id]
      : [],
    dueDate:
      t.dueInDays !== undefined
        ? new Date(Date.now() + t.dueInDays * 86_400_000)
        : undefined,
  }));
  await TaskModel.insertMany(docs);
  return docs.length;
};

// ---------------------------------------------------------------------------

const printSummary = (): void => {
  const W = 76;
  const line = (text = ''): void => {
    const padded = text.length > W - 4 ? text.slice(0, W - 4) : text;
    console.log('│ ' + padded.padEnd(W - 4) + ' │');
  };
  const sep = (): void => console.log('├' + '─'.repeat(W - 2) + '┤');

  console.log('\n┌' + '─'.repeat(W - 2) + '┐');
  line('  DevHub — datos de prueba creados');
  sep();
  line(`  Password compartido para todos:  ${SHARED_PASSWORD}`);
  sep();
  line('  Email                          Nombre              Rol en DevHub Demo');
  line('  ─────────────────────────────  ──────────────────  ────────────────────');
  line('  owner@devpanel.dev             Olivia Owner        OWNER');
  line('  admin@devpanel.dev             Adam Admin          ADMIN');
  line('  dev@devpanel.dev               Diego Developer     DEVELOPER');
  line('  viewer@devpanel.dev            Vera Viewer         VIEWER');
  line('  outsider@devpanel.dev          Erika External      (no es miembro)');
  sep();
  line('  Equipos creados:');
  line(`    · "${DEMO_TEAM.name}" (${DEMO_TEAM.plan}) — 3 proyectos con repos + tareas`);
  line(`    · "${FREE_TEAM.name}" (${FREE_TEAM.plan}) — 1 proyecto, solo Olivia`);
  sep();
  line('  Repos conectados (públicos): angular/components, expressjs/express,');
  line('  vercel/vercel, withastro/astro. La pestaña GitHub muestra datos reales.');
  console.log('└' + '─'.repeat(W - 2) + '┘\n');
};

// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  console.log('[seed] Conectando a MongoDB…');
  await connectDatabase();

  console.log('[seed] Sembrando usuarios…');
  const users = new Map<string, UserDocument>();
  let repairedUsers = 0;
  for (const u of USERS) {
    const result = await upsertUser(u);
    users.set(u.email, result.doc);
    if (result.state === 'repaired-hash') repairedUsers += 1;
    const tag =
      result.state === 'created'
        ? '✓ creado'
        : result.state === 'repaired-hash'
          ? '⚠ passwordHash reparado'
          : '· ya existía';
    console.log(`  ${tag}  ${u.email}  (_id=${result.doc._id})`);
  }
  if (repairedUsers > 0) {
    console.log(`  → Se repararon ${repairedUsers} usuario(s) sin passwordHash.`);
  }

  const olivia = users.get('owner@devpanel.dev')!;

  console.log(`\n[seed] Equipo "${DEMO_TEAM.name}" (${DEMO_TEAM.plan})…`);
  const demoTeam = await upsertTeam(DEMO_TEAM, olivia._id);
  await upsertSubscription(demoTeam._id, DEMO_TEAM.plan);
  for (const m of DEMO_MEMBERSHIPS) {
    const user = users.get(m.email)!;
    await upsertMembership(demoTeam._id, user._id, m.role);
    console.log(`  ✓ ${m.email}  ->  ${m.role}`);
  }
  console.log(`  → team _id=${demoTeam._id}`);

  console.log('\n[seed] Proyectos del equipo demo (+ repos + tareas)…');
  let totalTasks = 0;
  for (const p of DEMO_PROJECTS) {
    const project = await upsertProject(demoTeam._id, olivia._id, p);
    const made = await seedTasks(project, p.tasks, olivia._id, users);
    totalTasks += made;
    const repo = p.github ? `  [${p.github.owner}/${p.github.repo}]` : '';
    console.log(`  ✓ ${p.name} [${p.status}]${repo}  (+${made} tareas)`);
  }

  console.log(`\n[seed] Equipo "${FREE_TEAM.name}" (${FREE_TEAM.plan}) — solo Olivia…`);
  const freeTeam = await upsertTeam(FREE_TEAM, olivia._id);
  await upsertSubscription(freeTeam._id, FREE_TEAM.plan);
  await upsertMembership(freeTeam._id, olivia._id, 'OWNER');
  const freeProject = await upsertProject(freeTeam._id, olivia._id, FREE_PROJECT);
  totalTasks += await seedTasks(freeProject, FREE_PROJECT.tasks, olivia._id, users);
  console.log(`  → team _id=${freeTeam._id}`);

  const [userCount, teamCount, memberCount, projectCount, taskCount, activityCount] =
    await Promise.all([
      UserModel.countDocuments(),
      TeamModel.countDocuments(),
      TeamMemberModel.countDocuments(),
      ProjectModel.countDocuments(),
      TaskModel.countDocuments(),
      ActivityLogModel.countDocuments(),
    ]);

  console.log('\n[seed] Estado total de la BD:');
  console.log(
    `  users=${userCount}  teams=${teamCount}  memberships=${memberCount}  ` +
      `projects=${projectCount}  tasks=${taskCount} (+${totalTasks} nuevas)  activity=${activityCount}`,
  );

  printSummary();

  await disconnectDatabase();
  console.log('[seed] Hecho. Conexión cerrada.');
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[seed] FAILED:', err);
    void disconnectDatabase().finally(() => process.exit(1));
  });
