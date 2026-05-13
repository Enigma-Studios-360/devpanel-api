/* eslint-disable no-console */
/**
 * Seed script — creates test users with every role plus a demo team
 * (STARTER plan with 3 projects) and a Free-tier solo team for the
 * owner. Idempotent: re-running it never duplicates data and never
 * overwrites existing passwords.
 *
 * Run with:  npm run seed
 */

import bcrypt from 'bcrypt';
import { Types } from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel, type UserDocument } from '../modules/users/user.model';
import { TeamModel, type TeamDocument } from '../modules/teams/team.model';
import { TeamMemberModel } from '../modules/teams/team-member.model';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { ProjectModel } from '../modules/projects/project.model';
import { ActivityLogModel } from '../modules/activity/activity.model';
import { PLAN_LIMITS, type PlanCode } from '../shared/constants/plans';
import type { TeamRole } from '../shared/constants/roles';
import type { ProjectStatus } from '../shared/constants/project-status';

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

interface SeedProject {
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  stack: string[];
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
  name: 'DevPanel Demo',
  slug: 'devpanel-demo',
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
    name: 'Landing Page',
    slug: 'landing-page',
    description: 'Sitio público de marketing para DevPanel.',
    status: 'DEVELOPMENT',
    stack: ['Angular', 'SCSS', 'PrimeNG'],
  },
  {
    name: 'Backend API',
    slug: 'backend-api',
    description: 'API REST para autenticación, equipos y proyectos.',
    status: 'TESTING',
    stack: ['Express', 'TypeScript', 'MongoDB'],
  },
  {
    name: 'Mobile App',
    slug: 'mobile-app',
    description: 'App móvil de solo consulta (Fase 5).',
    status: 'PLANNING',
    stack: ['Kotlin'],
  },
];

const FREE_TEAM = {
  name: 'Free Tier Demo',
  slug: 'free-tier-demo',
  plan: 'FREE' as PlanCode,
};

const FREE_PROJECT: SeedProject = {
  name: 'Mi proyecto personal',
  slug: 'mi-proyecto-personal',
  description: 'Proyecto solo en plan FREE — sirve para demostrar el límite.',
  status: 'PLANNING',
  stack: ['Astro'],
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
    // Repair-on-detect: if a previous version of the seed (or a manual
    // insert) created the user without a valid passwordHash, regenerate it
    // with the demo password. We never overwrite a real, valid hash.
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
): Promise<void> => {
  const existing = await ProjectModel.findOne({ team: teamId, slug: seed.slug });
  if (existing) return;
  await ProjectModel.create({
    team: teamId,
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    status: seed.status,
    stack: seed.stack,
    members: [ownerId],
    createdBy: ownerId,
    color: '#3B82F6',
  });
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
  line('  DevPanel — usuarios de prueba creados');
  sep();
  line(`  Password compartido para todos:  ${SHARED_PASSWORD}`);
  sep();
  line('  Email                          Nombre              Rol en DevPanel Demo');
  line('  ─────────────────────────────  ──────────────────  ────────────────────');
  line('  owner@devpanel.dev             Olivia Owner        OWNER');
  line('  admin@devpanel.dev             Adam Admin          ADMIN');
  line('  dev@devpanel.dev               Diego Developer     DEVELOPER');
  line('  viewer@devpanel.dev            Vera Viewer         VIEWER');
  line('  outsider@devpanel.dev          Erika External      (no es miembro)');
  sep();
  line('  Equipos creados:');
  line(`    · "${DEMO_TEAM.name}" (${DEMO_TEAM.plan}) — 3 proyectos, 4 miembros`);
  line(`    · "${FREE_TEAM.name}" (${FREE_TEAM.plan}) — 1 proyecto, solo Olivia`);
  sep();
  line('  Tip: inicia sesión como Vera para probar restricciones de VIEWER');
  line('       (no podrá hacer simulate-upgrade) y como Olivia para verlo todo.');
  console.log('└' + '─'.repeat(W - 2) + '┘\n');
};

// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  console.log('[seed] Conectando a MongoDB…');
  await connectDatabase();

  console.log('[seed] Sembrando usuarios…');
  const users = new Map<string, UserDocument>();
  let createdUsers = 0;
  let repairedUsers = 0;
  for (const u of USERS) {
    const result = await upsertUser(u);
    users.set(u.email, result.doc);
    if (result.state === 'created') createdUsers += 1;
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

  console.log('\n[seed] Proyectos del equipo demo…');
  for (const p of DEMO_PROJECTS) {
    await upsertProject(demoTeam._id, olivia._id, p);
    console.log(`  ✓ ${p.name} [${p.status}]`);
  }

  console.log(`\n[seed] Equipo "${FREE_TEAM.name}" (${FREE_TEAM.plan}) — solo Olivia…`);
  const freeTeam = await upsertTeam(FREE_TEAM, olivia._id);
  await upsertSubscription(freeTeam._id, FREE_TEAM.plan);
  await upsertMembership(freeTeam._id, olivia._id, 'OWNER');
  await upsertProject(freeTeam._id, olivia._id, FREE_PROJECT);
  console.log(`  → team _id=${freeTeam._id}`);

  // Summary counts so the user knows what's in DB
  const [userCount, teamCount, memberCount, projectCount, activityCount] = await Promise.all([
    UserModel.countDocuments(),
    TeamModel.countDocuments(),
    TeamMemberModel.countDocuments(),
    ProjectModel.countDocuments(),
    ActivityLogModel.countDocuments(),
  ]);

  console.log('\n[seed] Estado total de la BD:');
  console.log(`  users=${userCount}  teams=${teamCount}  memberships=${memberCount}  projects=${projectCount}  activity=${activityCount}`);

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
