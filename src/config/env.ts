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
} as const;

export const isProduction = env.nodeEnv === 'production';
export const isDevelopment = env.nodeEnv === 'development';
