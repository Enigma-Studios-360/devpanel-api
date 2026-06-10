import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { UserModel } from '../users/user.model';
import { encryptSecret, decryptSecret } from '../../shared/utils/crypto';

/**
 * Per-user GitHub connection via OAuth. The user authorizes DevHub once;
 * we store their access token (encrypted) and from then on all GitHub calls
 * for that user run as them — so private repos and "create issue as me" work
 * without a shared PAT. Falls back to GITHUB_TOKEN when a user isn't connected.
 */
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API_USER_URL = 'https://api.github.com/user';
const SCOPES = 'repo read:user';

const callbackUrl = (): string => `${env.apiBaseUrl}/api/github/oauth/callback`;

export const githubOauthService = {
  isConfigured(): boolean {
    return Boolean(env.githubOauthClientId && env.githubOauthClientSecret);
  },

  /** GitHub authorize URL with a signed, short-lived state carrying the user id. */
  buildAuthorizeUrl(userId: string): string {
    if (!this.isConfigured()) {
      throw new AppError(
        'La conexión con GitHub (OAuth) no está configurada en el servidor.',
        503,
        'GITHUB_OAUTH_NOT_CONFIGURED',
      );
    }
    const state = jwt.sign({ uid: userId, p: 'gh-oauth' }, env.jwtSecret, {
      expiresIn: '10m',
    });
    const params = new URLSearchParams({
      client_id: env.githubOauthClientId,
      redirect_uri: callbackUrl(),
      scope: SCOPES,
      state,
      allow_signup: 'false',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  /** Exchange the code for a token, read the GitHub login, store encrypted. */
  async handleCallback(code: string, state: string): Promise<{ userId: string; login: string }> {
    let uid: string;
    try {
      const decoded = jwt.verify(state, env.jwtSecret) as { uid?: string; p?: string };
      if (decoded.p !== 'gh-oauth' || !decoded.uid) throw new Error('bad state');
      uid = decoded.uid;
    } catch {
      throw new AppError('El estado de OAuth es inválido o expiró.', 400, 'GITHUB_OAUTH_BAD_STATE');
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.githubOauthClientId,
        client_secret: env.githubOauthClientSecret,
        code,
        redirect_uri: callbackUrl(),
      }),
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
    };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new AppError(
        `GitHub no devolvió un token (${tokenJson.error ?? 'desconocido'}).`,
        502,
        'GITHUB_OAUTH_EXCHANGE_FAILED',
      );
    }

    const userRes = await fetch(API_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DevHub',
      },
    });
    const ghUser = (await userRes.json().catch(() => ({}))) as { login?: string };
    const login = ghUser.login ?? 'github-user';

    await UserModel.updateOne(
      { _id: uid },
      { $set: { githubLogin: login, githubTokenEnc: encryptSecret(accessToken) } },
    );
    return { userId: uid, login };
  },

  async status(userId: string): Promise<{ configured: boolean; connected: boolean; login: string | null }> {
    const user = await UserModel.findById(userId).select('githubLogin githubTokenEnc').lean();
    return {
      configured: this.isConfigured(),
      connected: Boolean(user?.githubTokenEnc),
      login: user?.githubLogin ?? null,
    };
  },

  async disconnect(userId: string): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      { $unset: { githubLogin: '', githubTokenEnc: '' } },
    );
  },

  /** Decrypted token for server-side calls. Null when the user isn't connected. */
  async getAccessToken(userId: string): Promise<string | null> {
    const user = await UserModel.findById(userId).select('githubTokenEnc').lean();
    if (!user?.githubTokenEnc) return null;
    return decryptSecret(user.githubTokenEnc);
  },
};
