import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';

const start = async (): Promise<void> => {
  await connectDatabase();

  const app = createApp();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `\n🚀 DevPanel API listening on http://localhost:${env.port}` +
        `\n   Environment: ${env.nodeEnv}` +
        `\n   Health:      http://localhost:${env.port}/health` +
        `\n   Meta:        http://localhost:${env.port}/api/meta\n`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`\n[${signal}] Shutting down...`);
    server.close(() => {
      // eslint-disable-next-line no-console
      console.log('[server] HTTP server closed');
    });
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
};

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[server] Failed to start:', error);
  process.exit(1);
});
