# Contribuir a DevHub

¡Gracias por tu interés! DevHub es construido por estudiantes, para gente que
está aprendiendo — los PRs de principiantes son bienvenidos de verdad.

## Antes de empezar

1. Levanta el proyecto localmente ([README.md](README.md), sección "Levantarlo en 10 minutos").
2. Busca un issue abierto (los marcados `good first issue` son el mejor punto de
   entrada) o abre uno describiendo lo que quieres cambiar **antes** de codear.

## Flujo de trabajo

- Ramas: **`dev`** es la rama de trabajo; **`main`** es estable. Los PRs van a `dev`.
- Nombra tu rama: `feat/lo-que-agrega`, `fix/lo-que-arregla`, `docs/lo-que-documenta`.
- Commits en presente y descriptivos (`feat: agrega filtro por rama en deploy`).
- Un PR = un cambio. PRs gigantes se revisan lento o se rechazan.

## Convenciones de código (no negociables)

- **TypeScript strict** — nada de `any` sin justificación en comentario.
- **Todo input se valida con Zod `.strict()`** en `*.validation.ts`.
- **Contrato de respuesta único:** `{success, data}` / `{success, error: {code, message}}`
  — usa los helpers `ok(...)` / `fail(...)`.
- Controllers ligeros; la lógica vive en `*.service.ts`.
- Autorización SIEMPRE server-side (middlewares de rol/equipo); nunca confíes en el cliente.
- **Seguridad primero:** tokens de usuarios siempre cifrados (ver `crypto.ts`);
  jamás uses el `GITHUB_TOKEN` de plataforma para operar sobre repos de usuarios;
  jamás loguees secretos.

## Qué NO aceptamos

- Features que cobren por seguridad (va contra el principio del proyecto).
- Dependencias pesadas para problemas chicos.
- Cambios de stack (Express/Angular se quedan — ver `docs/06_DECISIONES.md` del workspace).

## Licencia de tus contribuciones

Al abrir un pull request:

1. Certificas el **Developer Certificate of Origin (DCO)**: que tienes derecho a
   contribuir ese código (es tuyo o compatible con AGPLv3).
2. Aceptas que tu contribución se licencia bajo **AGPL-3.0** como el resto del proyecto.
3. Otorgas a los mantenedores de DevHub (equipo enigma) una licencia perpetua,
   mundial, no exclusiva y libre de regalías para usar, modificar y **relicenciar**
   tu contribución — esto nos permite ofrecer en el futuro una versión en la nube
   sin fragmentar el proyecto.

Si no estás de acuerdo con el punto 3, dilo en el PR y lo platicamos antes de mergear.

## Reportar bugs y vulnerabilidades

- Bugs normales → issue con pasos para reproducir.
- **Vulnerabilidades de seguridad → NO abras issue público.** Sigue [SECURITY.md](SECURITY.md).
