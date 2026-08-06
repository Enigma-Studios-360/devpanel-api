# DevHub API

Backend de **DevHub** — la plataforma open source que lleva a un principiante
absoluto desde *"tengo una carpeta con código"* hasta *"mi proyecto está en
internet"*: gestión de proyectos en equipo, GitHub sin saber Git, deploy con
wizard y aprendizaje gamificado. En español primero.

> 🎓 Nacido como proyecto académico en la UTJ (equipo enigma) y en camino a ser
> plataforma abierta. Licencia **AGPLv3** — ver [LICENSE](LICENSE).
> La dirección del proyecto vive en `docs/` del workspace.

## Lo que hace hoy (sin humo)

- **Auth + equipos con roles** — OWNER/ADMIN/DEVELOPER/VIEWER validados server-side.
- **Proyectos, tareas kanban, docs, archivos, actividad, notificaciones, búsqueda, dashboard.**
- **GitHub por usuario (OAuth)** — cada quien conecta SU cuenta; su token se cifra
  AES-256-GCM; selector de repos propios con botones.
- **"Sube tu proyecto"** — un ZIP crudo (con `.env`, `node_modules` y todo) se
  analiza ANTES de subir nada: reporte educativo de qué se excluye y por qué
  (secretos, dependencias, basura), y el código limpio se sube a un repo creado
  **en la cuenta GitHub del usuario** vía Git Data API — sin Git instalado.
- **Wizard de deploy a Vercel** — detección de stack, presets, URL pública + QR.
  Si el stack no es desplegable (p. ej. Laravel), **lo dice honestamente**.
- **Arcade** — progreso y leaderboard de DevCrafting (nuestro juego Unity,
  desplegado con esta misma plataforma).
- **Planes con límites** (STARTER/PRO/ENTERPRISE) — la mecánica funciona;
  los pagos son **simulados a propósito** en esta etapa.
- **Asistente IA** (DeepSeek) contextual.

**Limitaciones actuales:** API pensada para correr local/self-host; el deploy sale
de un token Vercel de plataforma (single-tenant); cobertura de tests mínima. El
plan para atacarlas está en `docs/04_ROADMAP_TECNICO.md` del workspace.

## Stack

Node.js + **Express 5** · **TypeScript strict** · **MongoDB Atlas + Mongoose** ·
**Zod** (`.strict()` en todo input) · JWT + bcrypt · **Octokit** · Multer.

Contrato de respuesta único:

```jsonc
{ "success": true,  "data": { /* ... */ } }
{ "success": false, "error": { "code": "SOME_CODE", "message": "..." } }
```

## Levantarlo en 10 minutos

```bash
cd devpanel-api
npm install
cp .env.example .env    # llena MONGODB_URI y JWT_SECRET como mínimo
npm run dev             # http://localhost:4000
```

Con MongoDB conectado, crea datos demo:

```bash
npm run db:seed
```

Cuentas demo (password compartido `password123`):

| Email | Rol en "DevHub Demo" |
|---|---|
| `owner@devpanel.dev` | OWNER |
| `admin@devpanel.dev` | ADMIN |
| `dev@devpanel.dev` | DEVELOPER |
| `viewer@devpanel.dev` | VIEWER |
| `outsider@devpanel.dev` | (sin equipo) |

GitHub OAuth y Vercel son opcionales para desarrollo: sin sus llaves, esos módulos
devuelven errores claros y el resto de la app funciona.

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Hot reload con `ts-node-dev` (puerto `4000`) |
| `npm run build` / `npm start` | Compilar a `dist/` y ejecutar |
| `npm run typecheck` | Verificar tipos sin emitir |
| `npm run db:seed` | Seed demo idempotente (5 users + equipos + proyectos) |
| `npm run db:seed:users` | Solo usuarios (para probar el tutorial guiado) |
| `npm run db:reset` | Borrar todo (dry-run; confirma con `-- --yes`) |

## Estructura

```
src/
├── app.ts / server.ts          # Express + bootstrap
├── config/                     # env, database, cors, storage (multer)
├── middlewares/                # auth (JWT), roles por equipo, team-context,
│                               # plan-limits, validate (Zod), errores
├── shared/                     # AppError, constants (roles/planes), utils, types
└── modules/                    # 17 módulos: controller + service + validation + routes
    ├── auth, users, teams, projects, tasks, activity
    ├── files, docs, notifications, search, dashboard
    ├── github (OAuth por usuario + Octokit), imports ("Sube tu proyecto")
    ├── deploy (Vercel), arcade, subscriptions, assistant
```

Convenciones: controllers ligeros, lógica en services, validación Zod en
`*.validation.ts`, errores vía `AppError`, respuestas con `ok(...)`/`fail(...)`.

## Contribuir

¡Bienvenido! Lee [CONTRIBUTING.md](CONTRIBUTING.md) (convenciones, ramas
`dev`→`main`, y la cláusula de licencia de contribuciones). Para reportar
vulnerabilidades: [SECURITY.md](SECURITY.md).

## Licencia

[AGPL-3.0](LICENSE) © equipo enigma. Puedes usarlo, estudiarlo, modificarlo y
auto-hospedarlo libremente; si lo ofreces como servicio en red, debes publicar
tus modificaciones bajo la misma licencia.
