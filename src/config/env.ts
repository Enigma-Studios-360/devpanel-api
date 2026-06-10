import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const required = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongoUri: process.env.MONGODB_URI ?? '',
  mongoDatabase: process.env.MONGODB_DATABASE ?? '',

  jwtSecret: required('JWT_SECRET', 'change_me_dev_only'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',

  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',

  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',

  githubToken: process.env.GITHUB_TOKEN ?? '',

  /**
   * GitHub OAuth App credentials (per-user "Connect GitHub"). Optional — if
   * empty, the connect endpoints return a typed "not configured" error and
   * the app falls back to the shared GITHUB_TOKEN above. Register an app at
   * https://github.com/settings/developers with callback
   * `${API_BASE_URL}/api/github/oauth/callback`.
   */
  githubOauthClientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
  githubOauthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',

  /** Public base URL of the SPA, used to redirect back after OAuth flows. */
  webBaseUrl: (process.env.WEB_BASE_URL ?? 'http://localhost:4200').replace(/\/$/, ''),
  /** Public base URL of THIS API, used to build the OAuth callback URL. */
  apiBaseUrl: (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, ''),

  /**
   * DeepSeek API (used as the LLM behind the assistant). Optional — when
   * empty the assistant falls back to the local FAQ catalog only.
   * Base URL is OpenAI-compatible; default points at DeepSeek prod.
   */
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekBaseUrl:
    process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  /** Max tokens per single assistant reply. Keep tight to control cost. */
  deepseekMaxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS ?? 400),
  /**
   * Per-user assistant request budget within a 1-minute window. Defensive
   * cap so a runaway client can't burn the API key.
   */
  assistantRatePerMinute: Number(process.env.ASSISTANT_RATE_PER_MINUTE ?? 12),
  /**
   * Emails that bypass the per-plan WEEKLY assistant quota (your own tester
   * account). Comma-separated, case-insensitive. Example in .env:
   *   ASSISTANT_POWER_EMAILS=owner@devpanel.dev,tu-correo@gmail.com
   */
  assistantPowerEmails: (process.env.ASSISTANT_POWER_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  /**
   * Vercel personal access token (used by the Deploy Wizard). Optional —
   * if empty, the deploy endpoints return ASSISTANT_NOT_CONFIGURED-style
   * errors and the wizard UI degrades to read-only.
   *
   * Scopes needed: full account (read projects, create projects, create
   * deployments). The token never leaves the backend.
   */
  vercelToken: process.env.VERCEL_TOKEN ?? '',
  vercelApiBase: process.env.VERCEL_API_BASE ?? 'https://api.vercel.com',
  /** Optional team slug if the user wants to deploy under a team scope. */
  vercelTeamId: process.env.VERCEL_TEAM_ID ?? '',
} as const;

export const isProduction = env.nodeEnv === 'production';
export const isDevelopment = env.nodeEnv === 'development';
