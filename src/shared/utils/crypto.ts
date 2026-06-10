import crypto from 'crypto';
import { env } from '../../config/env';

/**
 * Symmetric encryption for secrets we must store at rest (e.g. per-user
 * GitHub OAuth tokens). AES-256-GCM with a key derived from JWT_SECRET, so
 * no extra env var is required. Output format: "iv:tag:ciphertext" (base64).
 *
 * NOTE: rotating JWT_SECRET invalidates previously-encrypted values — they'd
 * fail to decrypt and the user simply re-connects. That's an acceptable
 * trade-off for an academic SaaS; a production system would use a dedicated
 * KMS key.
 */
const KEY = crypto.createHash('sha256').update(env.jwtSecret).digest(); // 32 bytes

export const encryptSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
};

export const decryptSecret = (payload: string): string | null => {
  try {
    const [ivB, tagB, dataB] = payload.split(':');
    if (!ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      KEY,
      Buffer.from(ivB, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
};
