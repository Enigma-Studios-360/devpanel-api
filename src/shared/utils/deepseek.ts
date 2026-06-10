import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

/**
 * Minimal DeepSeek (OpenAI-compatible) chat client shared by the assistant
 * and the AI doc generator. Keeps the key on the server and surfaces typed
 * errors so callers can degrade gracefully.
 */
export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekOptions {
  maxTokens?: number;
  temperature?: number;
  /** Ask DeepSeek to return a strict JSON object (response_format). */
  jsonMode?: boolean;
  timeoutMs?: number;
}

export const isDeepSeekConfigured = (): boolean => Boolean(env.deepseekApiKey);

export async function deepseekChat(
  messages: DeepSeekMessage[],
  opts: DeepSeekOptions = {},
): Promise<string> {
  if (!env.deepseekApiKey) {
    throw new AppError(
      'La integración con DeepSeek no está configurada en el servidor.',
      503,
      'ASSISTANT_NOT_CONFIGURED',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);

  let response: Response;
  try {
    response = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages,
        temperature: opts.temperature ?? 0.5,
        max_tokens: opts.maxTokens ?? env.deepseekMaxTokens,
        stream: false,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = (err as { name?: string }).name === 'AbortError';
    throw new AppError(
      aborted ? 'DeepSeek tardó demasiado en responder.' : 'No fue posible contactar con DeepSeek.',
      aborted ? 504 : 502,
      aborted ? 'ASSISTANT_TIMEOUT' : 'ASSISTANT_UPSTREAM',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* ignore parse errors */
    }
    if (response.status === 401 || response.status === 403) {
      throw new AppError('La API key de DeepSeek fue rechazada.', 502, 'ASSISTANT_AUTH_FAILED');
    }
    if (response.status === 402) {
      throw new AppError(
        'La cuenta de DeepSeek no tiene saldo. Recarga créditos para usar la IA.',
        402,
        'ASSISTANT_NO_BALANCE',
      );
    }
    if (response.status === 429) {
      throw new AppError('DeepSeek alcanzó su límite de uso. Intenta en unos segundos.', 429, 'ASSISTANT_UPSTREAM_RATE_LIMIT');
    }
    throw new AppError(
      `DeepSeek devolvió ${response.status}${detail ? `: ${detail}` : ''}.`,
      502,
      'ASSISTANT_UPSTREAM',
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = body.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new AppError('DeepSeek devolvió una respuesta vacía.', 502, 'ASSISTANT_EMPTY_REPLY');
  }
  return reply;
}
