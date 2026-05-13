import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './env';

/**
 * Workaround for a known issue on Windows where Node's default DNS
 * resolver fails to query SRV records used by `mongodb+srv://` URIs
 * (querySrv ECONNREFUSED), even though the OS resolver works fine.
 *
 * We force a reliable public DNS only when the URI uses SRV. We do
 * this once per process and don't touch other lookups.
 */
const ensureSrvFriendlyDns = (uri: string): void => {
  if (!uri.startsWith('mongodb+srv://')) return;
  try {
    dns.setServers(['1.1.1.1', '8.8.8.8']);
  } catch {
    // ignore — fall back to whatever Node already had
  }
};

export const connectDatabase = async (): Promise<void> => {
  if (!env.mongoUri) {
    console.warn(
      '[database] MONGODB_URI is not set. Skipping MongoDB connection (server will run without DB).',
    );
    return;
  }

  ensureSrvFriendlyDns(env.mongoUri);

  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 12000,
      ...(env.mongoDatabase ? { dbName: env.mongoDatabase } : {}),
    });

    const dbName = mongoose.connection.db?.databaseName ?? 'unknown';
    console.log(`[database] Connected to MongoDB (db: ${dbName})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[database] Failed to connect to MongoDB:', message);
    if (env.nodeEnv === 'production') {
      process.exit(1);
    }
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};

export const isDatabaseConnected = (): boolean =>
  mongoose.connection.readyState === 1;
