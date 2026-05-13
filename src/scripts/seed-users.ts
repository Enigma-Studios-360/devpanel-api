/* eslint-disable no-console */
/**
 * Minimal seed — only creates the demo users (no teams, no projects).
 *
 * Use this when you want to test the guided tutorial from a clean slate:
 * the user logs in, has zero teams, and the tour walks them through
 * creating the first one.
 *
 *   npm run db:seed:users
 *
 * Idempotent: re-running it never changes existing valid passwords. If a
 * user exists with a missing/broken passwordHash, it gets repaired.
 */

import bcrypt from 'bcrypt';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { UserModel } from '../modules/users/user.model';

const SHARED_PASSWORD = 'password123';
const SALT_ROUNDS = 10;

const USERS = [
  { name: 'Olivia Owner', email: 'owner@devpanel.dev' },
  { name: 'Adam Admin', email: 'admin@devpanel.dev' },
  { name: 'Diego Developer', email: 'dev@devpanel.dev' },
  { name: 'Vera Viewer', email: 'viewer@devpanel.dev' },
  { name: 'Erika External', email: 'outsider@devpanel.dev' },
];

const isValidHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 20;

const main = async (): Promise<void> => {
  console.log('[seed:users] Conectando a MongoDB…');
  await connectDatabase();

  console.log('[seed:users] Sembrando usuarios (sin equipos ni proyectos)…');
  let created = 0;
  let repaired = 0;
  for (const u of USERS) {
    const existing = await UserModel.findOne({ email: u.email });
    if (existing) {
      if (!isValidHash(existing.passwordHash)) {
        existing.passwordHash = await bcrypt.hash(SHARED_PASSWORD, SALT_ROUNDS);
        if (!existing.status) existing.status = 'ACTIVE';
        if (!existing.name) existing.name = u.name;
        await existing.save();
        repaired += 1;
        console.log(`  ⚠ ${u.email}  passwordHash reparado`);
      } else {
        console.log(`  · ${u.email}  ya existía`);
      }
      continue;
    }
    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, SALT_ROUNDS);
    await UserModel.create({
      name: u.name,
      email: u.email,
      passwordHash,
      status: 'ACTIVE',
    });
    created += 1;
    console.log(`  ✓ ${u.email}  creado`);
  }

  console.log(`\n[seed:users] Resumen: ${created} creado(s), ${repaired} reparado(s).`);
  console.log(`[seed:users] Password compartido: ${SHARED_PASSWORD}`);
  console.log('[seed:users] Inicia sesión con cualquiera y deja que el tutorial te guíe.');

  await disconnectDatabase();
  process.exit(0);
};

main().catch((err) => {
  console.error('\n[seed:users] FAILED:', err);
  void disconnectDatabase().finally(() => process.exit(1));
});
