# DevHub API (carpeta interna `devpanel-api`)

> ⚠️ **README DESACTUALIZADO.** Describe la "Fase 1" inicial y NO refleja el
> estado real: el backend ya tiene 14 módulos funcionales (auth con roles,
> equipos, proyectos con cupo por plan, tareas Kanban, docs + generador de
> README, GitHub vía Octokit, Deploy Wizard a Vercel real, asistente DeepSeek,
> notificaciones, dashboard). La **fuente de verdad** es el código y
> `../devpanel_readmes/00_PROMPT_CONTINUAR_PROYECTO.md` (+ `10_FASE_3_5`).

Backend de **DevHub**, plataforma SaaS para centralizar la gestión de proyectos de desarrollo.

## Stack

- **Node.js** + **Express 5**
- **TypeScript** (strict)
- **MongoDB Atlas** + **Mongoose**
- **Helmet**, **CORS**, **Morgan**, **cookie-parser**
- **bcrypt** + **jsonwebtoken** (preparado para Fase 2)
- **Zod** para validación
- **Multer** para subida de archivos
- **Octokit** para integración con GitHub (Fase 6)

## Instalación

```bash
cd devpanel-api
npm install
cp .env.example .env   # luego edita las variables
npm run dev
```

El servidor levantará por defecto en `http://localhost:4000`.

## Variables de entorno

| Variable          | Descripción                                                    |
| ----------------- | -------------------------------------------------------------- |
| `PORT`            | Puerto HTTP (default: `4000`)                                  |
| `NODE_ENV`        | `development` \| `production` \| `test`                        |
| `MONGODB_URI`     | URI de MongoDB Atlas. Si está vacía, el servidor arranca sin DB |
| `JWT_SECRET`      | Secreto para firmar tokens                                     |
| `JWT_EXPIRES_IN`  | Tiempo de expiración (`1d`, `12h`, etc.)                       |
| `CORS_ORIGIN`     | Orígenes permitidos (separados por coma)                       |
| `UPLOAD_DIR`      | Carpeta de uploads (default: `uploads`)                        |
| `GITHUB_TOKEN`    | Token PAT para integración GitHub (Fase 6)                     |

## Scripts

| Comando                  | Acción                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `npm run dev`            | Arranca con `ts-node-dev` (hot reload) en `PORT` (default `4000`)     |
| `npm run build`          | Compila TypeScript a `dist/`                                          |
| `npm start`              | Ejecuta el build compilado                                            |
| `npm run typecheck`      | Verifica tipos sin emitir                                             |
| `npm run db:seed`        | Seed completo: 5 users + 2 equipos + proyectos demo                   |
| `npm run db:seed:users`  | Solo los 5 users (sin equipos) — para probar el **tutorial guiado**   |
| `npm run db:reset`       | Borra todo (dry-run por defecto; usa `-- --yes` para confirmar)       |
| `npm run seed`           | Alias retro-compat de `db:seed`                                       |

### Cambiar el puerto del backend

Edita `.env`:
```env
PORT=5000
```
Luego, en el frontend, edita `devpanel-web/public/config.js`:
```js
window.__APP_CONFIG__ = { apiUrl: 'http://localhost:5000' };
```
Recarga el navegador. **No hace falta recompilar.**

### Empezar desde cero (escenario "demo limpia")

```bash
npm run db:reset -- --yes      # borra todo
npm run db:seed:users          # solo crea los 5 users
npm run dev                    # arranca el server
```

Luego entra al frontend con `owner@devpanel.dev` / `password123`. El **tutorial de bienvenida** arrancará solo y, al terminar, como no tendrás equipos, automáticamente sugerirá el tour "Crear y gestionar equipos".

## Usuarios de prueba (`npm run db:seed`)

Ejecuta `npm run seed` (con MongoDB conectado) para crear cuentas listas para probar la app. El script es **idempotente**: vuelve a correrlo cuantas veces quieras y nunca duplica datos ni cambia contraseñas existentes.

**Password compartido:** `password123`

| Email                    | Nombre            | Equipo                        | Rol        |
| ------------------------ | ----------------- | ----------------------------- | ---------- |
| `owner@devpanel.dev`     | Olivia Owner      | DevPanel Demo + Free Tier Demo | OWNER      |
| `admin@devpanel.dev`     | Adam Admin        | DevPanel Demo                 | ADMIN      |
| `dev@devpanel.dev`       | Diego Developer   | DevPanel Demo                 | DEVELOPER  |
| `viewer@devpanel.dev`    | Vera Viewer       | DevPanel Demo                 | VIEWER     |
| `outsider@devpanel.dev`  | Erika External    | (ninguno)                     | —          |

**Equipos creados:**
- **DevPanel Demo** — plan **STARTER** (3 proyectos: Landing Page, Backend API, Mobile App), 4 miembros con los 4 roles.
- **Free Tier Demo** — plan **FREE** (1 proyecto), solo Olivia. Sirve para verificar el límite de 1 proyecto activo.

**Casos de prueba sugeridos:**
- Inicia sesión como **Vera (VIEWER)** y ve los proyectos del equipo demo. Intenta cambiar el plan en `/app/pricing` → debe rechazarte (`Insufficient team role`).
- Inicia sesión como **Adam (ADMIN)** → puede cambiar el plan.
- Inicia sesión como **Olivia (OWNER)** y entra a "Free Tier Demo" → intenta crear un segundo proyecto → debe bloquear con `PLAN_LIMIT_REACHED`.
- Inicia sesión como **Erika** → solo ve el dashboard sin equipos. Si fuerzas la URL `/app/teams/<id-del-demo>` → debe redirigir o devolver 403.

## Endpoints implementados (Fase 1)

| Método | Ruta            | Descripción                                  |
| ------ | --------------- | -------------------------------------------- |
| GET    | `/health`       | Estado del servidor + conexión a MongoDB     |
| GET    | `/api/meta`     | Metadata: nombre, versión, entorno, módulos  |
| GET    | `/api/plans`    | Catálogo de planes (Free/Starter/Pro/Team/School) |

Los demás routers (`auth`, `users`, `teams`, `projects`, `tasks`, `activity`, `docs`, `notifications`, `files`, `github`, `deploy`) están montados como **scaffolds** y devuelven `501 NOT_IMPLEMENTED` o un placeholder, listos para implementarse en fases siguientes.

## Estructura

```
src/
├── app.ts                      # Configuración Express + montaje de routers
├── server.ts                   # Bootstrap (DB + listen)
├── config/
│   ├── env.ts                  # Lee y valida .env
│   ├── database.ts             # Conexión Mongoose
│   ├── cors.ts                 # Política CORS
│   └── storage.ts              # Multer + uploads
├── middlewares/
│   ├── auth.middleware.ts      # JWT (preparado)
│   ├── role.middleware.ts      # Roles por equipo (preparado)
│   ├── error.middleware.ts     # Manejo global de errores + 404
│   ├── validate.middleware.ts  # Validación con Zod
│   └── plan-limit.middleware.ts# Límites por plan (Fase 2)
├── shared/
│   ├── errors/                 # AppError + http-errors
│   ├── utils/                  # slugify, pagination, date
│   ├── constants/              # roles, plans, project-status, task-status
│   └── types/                  # request-user, api-response
└── modules/
    ├── auth/                   # register, login, logout, me (scaffold)
    ├── users/                  # perfil del usuario
    ├── teams/                  # equipos + miembros + invitaciones
    ├── projects/               # proyectos
    ├── tasks/                  # tareas + comentarios
    ├── activity/               # log de actividad
    ├── docs/                   # documentación + README generado
    ├── subscriptions/          # planes + límites
    ├── notifications/          # notificaciones in-app
    ├── files/                  # archivos por proyecto
    ├── github/                 # integración GitHub (Fase 6)
    └── deploy/                 # checklist de deploy (Fase 7)
```

## Modelos Mongoose creados (Fase 1)

`User`, `Team`, `TeamMember`, `Project`, `Task`, `TaskComment`, `ActivityLog`, `ProjectDoc`, `Subscription`, `Notification`, `ProjectFile`, `DeployChecklist`.

## Roadmap

- **Fase 1** (esta) — Base técnica, modelos, scaffolds, `/health`, `/api/meta`.
- **Fase 2** — Auth real (register/login/JWT), CRUD de equipos, planes y límites.
- **Fase 3** — Proyectos + tareas Kanban + actividad + comentarios.
- **Fase 4** — Documentación guiada + generador de README.
- **Fase 5** — App móvil Kotlin de solo consulta.
- **Fase 6** — Integración GitHub (commits, issues, branches).
- **Fase 7** — Deploy Wizard (Vercel).
- **Fase 8** — Pulido + manuales + presentación.
- **Fase 9** — Pagos reales, OAuth GitHub, editor en línea, reportes PDF.

## Convenciones

- Controllers ligeros, lógica en services.
- Validación con Zod en `*.validation.ts`.
- Errores via `AppError` y subclases (`http-errors.ts`).
- Respuestas siempre con `ok(...)` / `fail(...)` para consistencia.
