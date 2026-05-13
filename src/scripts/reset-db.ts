/* eslint-disable no-console */
/**
 * Reset script — drops all DevPanel collections in the configured database.
 *
 * SAFETY: requires explicit confirmation flag `--yes` to run. Without it,
 * the script lists what it would delete and exits.
 *
 *   npm run db:reset            # dry-run + summary
 *   npm run db:reset -- --yes   # actually delete everything
 *
 * It only touches collections we own (users, teams, projects, tasks…). It
 * never drops the database itself, so other apps sharing the cluster are
 * unaffected.
 */

import readline from 'readline';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';

const COLLECTIONS = [
  'users',
  'teams',
  'teammembers',
  'subscriptions',
  'projects',
  'tasks',
  'taskcomments',
  'projectdocs',
  'activitylogs',
  'projectfiles',
  'notifications',
  'deploychecklists',
] as const;

const confirmed = (): boolean =>
  process.argv.includes('--yes') || process.argv.includes('-y');

const promptInteractive = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      '\n¿Confirmas que quieres BORRAR todas las collections? (escribe "borrar" para continuar): ',
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === 'borrar');
      },
    );
  });
};

const main = async (): Promise<void> => {
  console.log('[reset-db] Conectando a MongoDB…');
  await connectDatabase();

  const db = mongoose.connection.db;
  if (!db) {
    console.error('[reset-db] No hay conexión a la BD. Abortando.');
    process.exit(1);
  }

  const dbName = db.databaseName;
  console.log(`[reset-db] Conectado a la BD: "${dbName}"`);

  // Compute current counts so the user knows what they're about to lose
  console.log('\n[reset-db] Contenido actual:');
  const counts: Array<{ name: string; count: number }> = [];
  for (const name of COLLECTIONS) {
    try {
      const count = await db.collection(name).countDocuments();
      counts.push({ name, count });
      const tag = count === 0 ? '·' : '✓';
      console.log(`  ${tag} ${name.padEnd(20)} ${count}`);
    } catch {
      counts.push({ name, count: 0 });
      console.log(`  · ${name.padEnd(20)} (no existe)`);
    }
  }

  const total = counts.reduce((s, c) => s + c.count, 0);
  console.log(`\n[reset-db] Total documentos: ${total}`);

  if (total === 0) {
    console.log('[reset-db] Nada que borrar. Saliendo.');
    await disconnectDatabase();
    process.exit(0);
  }

  let proceed = confirmed();
  if (!proceed) {
    console.log(
      '\n[reset-db] DRY-RUN: no se borró nada. Para borrar de verdad:\n' +
        '  npm run db:reset -- --yes\n' +
        '  (o responde "borrar" si te preguntamos en interactivo)',
    );
    if (process.stdin.isTTY) {
      proceed = await promptInteractive();
    }
  }

  if (!proceed) {
    console.log('[reset-db] Operación cancelada. Saliendo.');
    await disconnectDatabase();
    process.exit(0);
  }

  console.log('\n[reset-db] Borrando…');
  for (const name of COLLECTIONS) {
    try {
      const r = await db.collection(name).deleteMany({});
      if (r.deletedCount > 0) {
        console.log(`  ✓ ${name.padEnd(20)} ${r.deletedCount} borrados`);
      }
    } catch (e) {
      console.warn(
        `  ⚠ ${name.padEnd(20)} fallo: ${(e as Error).message}`,
      );
    }
  }

  console.log('\n[reset-db] BD limpia. Ejecuta uno de estos para repoblarla:');
  console.log('  npm run db:seed         # 5 users + 2 equipos + proyectos');
  console.log('  npm run db:seed:users   # solo los 5 users (para tutorial guiado)');
  console.log('');

  await disconnectDatabase();
  process.exit(0);
};

main().catch((err) => {
  console.error('\n[reset-db] FAILED:', err);
  void disconnectDatabase().finally(() => process.exit(1));
});
