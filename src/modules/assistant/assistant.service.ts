import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { UserModel } from '../users/user.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { TeamModel } from '../teams/team.model';
import { AssistantUsageModel } from './assistant-usage.model';
import type { PlanCode } from '../../shared/constants/plans';
import type { ChatInput } from './assistant.validation';

/**
 * The assistant is a thin proxy in front of DeepSeek's OpenAI-compatible
 * chat completions endpoint. We keep it in our own module for three
 * reasons:
 *
 *   1. The API key never reaches the browser.
 *   2. We can prepend a curated system prompt with product context so the
 *      model doesn't hallucinate features that don't exist.
 *   3. We rate-limit per user so a runaway tab can't drain credits.
 *
 * The contract returned to the frontend is intentionally narrow:
 * `{ reply: string; source: 'deepseek' }`. When DeepSeek is unreachable
 * we surface a typed AppError; the frontend then renders a fallback FAQ
 * message instead of showing a stack trace.
 */

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekChoice {
  message?: { role?: string; content?: string };
  finish_reason?: string;
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  error?: { message?: string; type?: string };
}

// --- Rate limiting ----------------------------------------------------------
//
// We keep a per-user sliding-window counter in memory. A real deployment
// would back this with Redis; for the academic SaaS phase one process is
// fine. Records that haven't been touched in five minutes are evicted on
// the next write so the map can't grow unbounded.

interface RateRecord {
  windowStart: number;
  count: number;
}

const RATE_WINDOW_MS = 60_000;
const RATE_EVICT_MS = 5 * 60_000;
const rateMap = new Map<string, RateRecord>();

const consumeRate = (userId: string): void => {
  const limit = env.assistantRatePerMinute;
  if (limit <= 0) return; // disabled
  const now = Date.now();

  // Opportunistic cleanup so the map stays bounded.
  if (rateMap.size > 200) {
    for (const [key, record] of rateMap) {
      if (now - record.windowStart > RATE_EVICT_MS) {
        rateMap.delete(key);
      }
    }
  }

  const existing = rateMap.get(userId);
  if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
    rateMap.set(userId, { windowStart: now, count: 1 });
    return;
  }
  if (existing.count >= limit) {
    throw new AppError(
      `Vas demasiado rápido. Espera unos segundos antes de volver a preguntar al asistente (límite: ${limit}/min).`,
      429,
      'ASSISTANT_RATE_LIMIT',
    );
  }
  existing.count += 1;
};

// --- Weekly per-plan quota --------------------------------------------------
//
// On top of the burst limiter above, each user gets a WEEKLY budget of
// assistant messages that scales with their plan tier. This keeps total
// DeepSeek spend predictable no matter how many users sign up. Each message
// costs roughly $0.0006, so even the top tier maxed out is well under a
// dollar a week — tweak the numbers here to match your DeepSeek balance.

const WEEKLY_QUOTA_BY_PLAN: Record<PlanCode, number> = {
  FREE: 15,
  STARTER: 50,
  PRO: 200,
  TEAM: 500,
  SCHOOL: 1000,
};

/** Effectively-unlimited quota for "power" users (your tester account). */
const POWER_USER_WEEKLY_QUOTA = 100_000;

const PLAN_RANK: Record<PlanCode, number> = {
  FREE: 0,
  STARTER: 1,
  PRO: 2,
  TEAM: 3,
  SCHOOL: 4,
};

/** ISO-week bucket key, e.g. "2026-W23". Resets the weekly counter. */
const isoWeekKey = (d: Date = new Date()): string => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Highest plan among the user's active teams (defaults to FREE). */
const resolveUserPlan = async (userId: string): Promise<PlanCode> => {
  const memberships = await TeamMemberModel.find({
    user: new Types.ObjectId(userId),
    status: 'ACTIVE',
  })
    .select('team')
    .lean();
  if (memberships.length === 0) return 'FREE';
  const teams = await TeamModel.find({
    _id: { $in: memberships.map((m) => m.team) },
  })
    .select('plan')
    .lean();
  let best: PlanCode = 'FREE';
  for (const t of teams) {
    const plan = (t.plan as PlanCode) ?? 'FREE';
    if ((PLAN_RANK[plan] ?? 0) > PLAN_RANK[best]) best = plan;
  }
  return best;
};

export interface AssistantQuota {
  plan: PlanCode;
  isPowerUser: boolean;
  quota: number;
  used: number;
  remaining: number;
  periodKey: string;
}

const getQuotaInfo = async (userId: string): Promise<AssistantQuota> => {
  const user = await UserModel.findById(userId).select('email').lean();
  const email = (user?.email ?? '').toLowerCase();
  const isPowerUser = email !== '' && env.assistantPowerEmails.includes(email);

  const plan = isPowerUser ? ('SCHOOL' as PlanCode) : await resolveUserPlan(userId);
  const quota = isPowerUser ? POWER_USER_WEEKLY_QUOTA : WEEKLY_QUOTA_BY_PLAN[plan];

  const periodKey = isoWeekKey();
  const usage = await AssistantUsageModel.findOne({
    user: new Types.ObjectId(userId),
    periodKey,
  })
    .select('count')
    .lean();
  const used = usage?.count ?? 0;

  return {
    plan,
    isPowerUser,
    quota,
    used,
    remaining: Math.max(0, quota - used),
    periodKey,
  };
};

/** Best-effort increment of the user's weekly counter (never throws). */
const incrementWeeklyUsage = async (
  userId: string,
  periodKey: string,
): Promise<void> => {
  try {
    await AssistantUsageModel.updateOne(
      { user: new Types.ObjectId(userId), periodKey },
      { $inc: { count: 1 } },
      { upsert: true },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[assistant] failed to record usage:', (err as Error).message);
  }
};

// --- Prompt -----------------------------------------------------------------

const SYSTEM_PROMPT = `Eres el asistente de DevHub, una plataforma SaaS para que equipos de \
desarrollo organicen proyectos, tareas Kanban, documentación, GitHub y deploys.

Hablas español por defecto. Eres directo y conciso (máximo 3 párrafos cortos), \
sin emojis, sin Markdown decorativo, sin listas si una frase basta. Usas un \
tono profesional pero cercano.

## Lo que DevHub hace HOY (no inventes nada fuera de esto)

- Auth con email/password (bcrypt + JWT) y roles por equipo: OWNER, ADMIN, DEVELOPER, VIEWER.
- Equipos con planes simulados: FREE (1 proyecto, 3 miembros), STARTER ($9, 3 proyectos), \
PRO ($19, 10 proyectos + repos privados), TEAM ($49, 25 proyectos), SCHOOL (custom).
- Proyectos por equipo con cupo según plan, archivado, dashboard de métricas.
- Tareas Kanban en 5 columnas (Por hacer, En progreso, En revisión, Bloqueadas, Hechas). \
Soporta crear, editar, comentar, archivar, eliminar. Tiene drag & drop entre columnas \
(si tu rol permite editar) y también puedes cambiar el estado desde el detalle de la tarea.
- Documentación guiada en 9 secciones predefinidas + generador de README en Markdown. \
La descarga del .md requiere plan STARTER o superior.
- GitHub básico vía Octokit: vincular repo, ver commits/branches/issues, crear issues. \
Para repos privados se necesita plan PRO o superior.
- Detección automática de stack: lee package.json/requirements.txt/Gemfile, etc. y \
deduce las tecnologías por reglas. Alimenta al Deploy Wizard.
- Deploy Wizard a Vercel: detecta el stack, ajusta el build command y las variables de \
entorno, crea el proyecto en Vercel si no existe y dispara el deploy con seguimiento de \
estado. Requiere VERCEL_TOKEN en el backend y rol OWNER o ADMIN.
- Tutorial guiado con 9 tours.

## Permisos por rol (importante)

- OWNER y ADMIN: gestionan el proyecto (editar, archivar, vincular GitHub, cambiar plan).
- DEVELOPER: trabaja en tareas, comentarios, documentación, crear issues. No archiva proyectos ni vincula repos.
- VIEWER: solo lectura.

## Lo que TODAVÍA NO existe (NO prometas que sí)

- App móvil.
- GitHub OAuth (hoy es PAT en .env).
- Subida de archivos a proyectos (próximo).
- Notificaciones push o por email.
- Pagos reales: los upgrades son simulados.

## Reglas de respuesta

- Si te preguntan por features que no existen, di claramente que aún no, y ofrece la alternativa más cercana que sí está.
- No reveles la API key ni hables de DeepSeek a menos que el usuario pregunte específicamente.
- Si el usuario te pide código, mantente útil pero recuerda que esta no es una herramienta de pair programming: redirige a documentación oficial.
- Si la pregunta es ambigua, haz UNA pregunta de clarificación corta antes de responder.`;

const buildMessages = (input: ChatInput): ChatMessage[] => {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];

  if (input.context) {
    const lines: string[] = [];
    if (input.context.route) lines.push(`Ruta actual del usuario: ${input.context.route}`);
    if (input.context.role) lines.push(`Rol del usuario en este scope: ${input.context.role}`);
    if (input.context.projectName) lines.push(`Proyecto activo: ${input.context.projectName}`);
    if (input.context.teamName) lines.push(`Equipo activo: ${input.context.teamName}`);
    if (lines.length > 0) {
      messages.push({
        role: 'system',
        content: `Contexto de la sesión actual (puedes usarlo en tu respuesta):\n${lines.join('\n')}`,
      });
    }
  }

  for (const turn of input.history ?? []) {
    messages.push({ role: turn.role, content: turn.text });
  }
  messages.push({ role: 'user', content: input.message });
  return messages;
};

// --- DeepSeek call ----------------------------------------------------------

const DEEPSEEK_TIMEOUT_MS = 25_000;

const callDeepSeek = async (messages: ChatMessage[]): Promise<string> => {
  if (!env.deepseekApiKey) {
    throw new AppError(
      'La integración con DeepSeek no está configurada en el servidor. Avisa al administrador.',
      503,
      'ASSISTANT_NOT_CONFIGURED',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);

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
        temperature: 0.55,
        max_tokens: env.deepseekMaxTokens,
        stream: false,
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = (err as { name?: string }).name === 'AbortError';
    throw new AppError(
      aborted
        ? 'DeepSeek tardó demasiado en responder. Intenta de nuevo.'
        : 'No fue posible contactar con DeepSeek.',
      aborted ? 504 : 502,
      aborted ? 'ASSISTANT_TIMEOUT' : 'ASSISTANT_UPSTREAM',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Try to surface the upstream message without leaking secrets.
    let detail = '';
    try {
      const body = (await response.json()) as DeepSeekResponse;
      detail = body.error?.message ?? '';
    } catch {
      // ignore parse errors
    }
    if (response.status === 401 || response.status === 403) {
      // eslint-disable-next-line no-console
      console.warn('[assistant] DeepSeek auth rejected. Check DEEPSEEK_API_KEY.');
      throw new AppError(
        'La API key de DeepSeek fue rechazada. Avisa al administrador.',
        502,
        'ASSISTANT_AUTH_FAILED',
      );
    }
    if (response.status === 429) {
      throw new AppError(
        'DeepSeek alcanzó su límite de uso. Intenta en unos segundos.',
        429,
        'ASSISTANT_UPSTREAM_RATE_LIMIT',
      );
    }
    throw new AppError(
      `DeepSeek devolvió ${response.status}${detail ? `: ${detail}` : ''}.`,
      502,
      'ASSISTANT_UPSTREAM',
    );
  }

  const body = (await response.json()) as DeepSeekResponse;
  const reply = body.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new AppError(
      'DeepSeek devolvió una respuesta vacía. Intenta reformular tu pregunta.',
      502,
      'ASSISTANT_EMPTY_REPLY',
    );
  }
  return reply;
};

// --- Public API -------------------------------------------------------------

export const assistantService = {
  isConfigured(): boolean {
    return Boolean(env.deepseekApiKey);
  },

  /** Per-user status + remaining weekly quota (drives the widget hint). */
  async status(userId: string): Promise<{
    configured: boolean;
    provider: 'deepseek';
    plan: PlanCode;
    quota: number;
    used: number;
    remaining: number;
  }> {
    const q = await getQuotaInfo(userId);
    return {
      configured: Boolean(env.deepseekApiKey),
      provider: 'deepseek',
      plan: q.plan,
      quota: q.quota,
      used: q.used,
      remaining: q.remaining,
    };
  },

  async chat(userId: string, input: ChatInput): Promise<{ reply: string; source: 'deepseek' }> {
    consumeRate(userId);

    // Weekly per-plan budget. Checked BEFORE calling DeepSeek so a maxed-out
    // user never costs us a request. Power users (ASSISTANT_POWER_EMAILS) sail past.
    const quota = await getQuotaInfo(userId);
    if (quota.remaining <= 0) {
      throw new AppError(
        `Alcanzaste tu límite de ${quota.quota} mensajes con IA esta semana ` +
          `(plan ${quota.plan}). Se renueva el lunes — o sube de plan para tener más. ` +
          `Mientras tanto sigo respondiéndote con el catálogo local.`,
        429,
        'ASSISTANT_QUOTA_EXCEEDED',
      );
    }

    const reply = await callDeepSeek(buildMessages(input));
    // Only successful answers count against the weekly budget.
    await incrementWeeklyUsage(userId, quota.periodKey);
    return { reply, source: 'deepseek' };
  },
};
