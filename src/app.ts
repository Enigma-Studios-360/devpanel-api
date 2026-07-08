import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { corsOptions } from './config/cors';
import { isDatabaseConnected } from './config/database';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { ok } from './shared/types/api-response';

import { authRouter } from './modules/auth/auth.routes';
import { userRouter } from './modules/users/user.routes';
import { teamRouter } from './modules/teams/team.routes';
import { projectRouter } from './modules/projects/project.routes';
import { taskRouter } from './modules/tasks/task.routes';
import { activityRouter } from './modules/activity/activity.routes';
import { docsRouter } from './modules/docs/docs.routes';
import { subscriptionRouter } from './modules/subscriptions/subscription.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { fileRouter } from './modules/files/file.routes';
import { githubRouter } from './modules/github/github.routes';
import { deployRouter } from './modules/deploy/deploy.routes';
import { assistantRouter } from './modules/assistant/assistant.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { searchRouter } from './modules/search/search.routes';
import { arcadeRouter } from './modules/arcade/arcade.routes';

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json(
      ok({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
        database: isDatabaseConnected() ? 'connected' : 'disconnected',
      }),
    );
  });

  // Meta endpoint
  app.get('/api/meta', (_req: Request, res: Response) => {
    res.json(
      ok({
        appName: 'DevPanel API',
        version: '0.1.0',
        environment: env.nodeEnv,
        availableModules: [
          'auth',
          'users',
          'teams',
          'projects',
          'tasks',
          'activity',
          'docs',
          'subscriptions',
          'notifications',
          'files',
          'github',
          'deploy',
          'assistant',
          'dashboard',
          'arcade',
        ],
      }),
    );
  });

  // Mount module routers (most are scaffolds in Phase 1)
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/teams', teamRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/activity', activityRouter);
  app.use('/api/docs', docsRouter);
  app.use('/api', subscriptionRouter); // exposes GET /api/plans
  app.use('/api/notifications', notificationRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/deploy', deployRouter);
  app.use('/api/assistant', assistantRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/arcade', arcadeRouter);

  // 404 + error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
