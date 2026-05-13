import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UserModel, type UserDocument } from '../users/user.model';
import { AppError } from '../../shared/errors/AppError';
import { ConflictError } from '../../shared/errors/http-errors';
import type { LoginInput, RegisterInput } from './auth.validation';
import type { AuthSession, AuthTokenPayload } from './auth.types';

const SALT_ROUNDS = 10;

/**
 * Single failure mode for any authentication problem we surface to the
 * client. We never tell the user *why* their login failed — only that the
 * credentials were rejected. Internal context (missing hash, disabled
 * account, etc.) is kept in server logs.
 */
const invalidCredentials = (): AppError =>
  new AppError('Credenciales inválidas.', 401, 'INVALID_CREDENTIALS');

const toPublicUser = (user: UserDocument): AuthSession['user'] => ({
  _id: user._id.toString(),
  name: user.name,
  email: user.email,
  avatarUrl: user.avatarUrl ?? null,
  status: user.status as 'ACTIVE' | 'DISABLED',
});

const issueToken = (user: UserDocument): string => {
  const payload: AuthTokenPayload = {
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
  };
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.jwtSecret, options);
};

const isValidHash = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 20;

export const authService = {
  async register(input: RegisterInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await UserModel.create({
      name: input.name.trim(),
      email,
      passwordHash,
      status: 'ACTIVE',
    });

    return {
      token: issueToken(user),
      user: toPublicUser(user),
    };
  },

  async login(input: LoginInput): Promise<AuthSession> {
    const email = input.email.toLowerCase().trim();
    const user = await UserModel.findOne({ email });
    if (!user) {
      throw invalidCredentials();
    }
    if (user.status === 'DISABLED') {
      // eslint-disable-next-line no-console
      console.warn(`[auth] Login rejected: user ${user._id} is DISABLED`);
      throw invalidCredentials();
    }

    if (!isValidHash(user.passwordHash)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auth] User ${user._id} (${user.email}) has no passwordHash configured. ` +
          'Re-run "npm run seed" to repair seed users, or have the user reset their password.',
      );
      throw invalidCredentials();
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw invalidCredentials();
    }

    return {
      token: issueToken(user),
      user: toPublicUser(user),
    };
  },

  async me(userId: string): Promise<AuthSession['user']> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw invalidCredentials();
    }
    return toPublicUser(user);
  },
};
