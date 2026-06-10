/**
 * Declarative stack-detection rules.
 *
 * Each rule fires when at least one of its `signals` matches the project's
 * source tree. We compute confidence as `min(1.0, matched_signals * perSignalConfidence)`
 * so rules with multiple corroborating signals naturally outscore single-shot
 * ones. The detection function returns the top N matches with the evidence
 * (which file or dependency triggered each signal), so the UI can show the
 * "why" behind every match instead of a black-box label.
 *
 * Adding a new stack:
 *   1. Identify 1–3 strong signals (a config file at root, a unique dependency).
 *   2. Pick a `perSignalConfidence` between 0.5 (weak hint) and 0.9 (near-certain).
 *   3. Add the rule below — no code changes elsewhere.
 *
 * IMPORTANT: `dep` checks both `dependencies` and `devDependencies`. `fileExists`
 * is matched against the REPOSITORY ROOT only (we don't recurse — keeps the
 * detection one or two API calls).
 */

export type StackCategory =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'mobile'
  | 'language'
  | 'tooling';

export type StackSignal =
  | { type: 'fileExists'; path: string }
  | { type: 'dep'; dep: string }
  | { type: 'fileContent'; path: string; pattern: RegExp };

export interface StackRule {
  id: string;
  name: string;
  category: StackCategory;
  /** Short marketing-y line surfaced under the name in the UI. */
  hint?: string;
  /** Optional pi-icon class. */
  icon?: string;
  /** Each matched signal contributes this much (clamped to 1.0 total). */
  perSignalConfidence: number;
  signals: StackSignal[];
}

export const STACK_RULES: StackRule[] = [
  // -------------------------------------------------------------------------
  // Frontend frameworks
  // -------------------------------------------------------------------------
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'fullstack',
    hint: 'React framework con SSR/SSG',
    icon: 'pi-bolt',
    perSignalConfidence: 0.55,
    signals: [
      { type: 'fileExists', path: 'next.config.js' },
      { type: 'fileExists', path: 'next.config.mjs' },
      { type: 'fileExists', path: 'next.config.ts' },
      { type: 'dep', dep: 'next' },
    ],
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'frontend',
    hint: 'SPA framework de Google',
    icon: 'pi-shield',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'angular.json' },
      { type: 'dep', dep: '@angular/core' },
    ],
  },
  {
    id: 'vite-react',
    name: 'Vite + React',
    category: 'frontend',
    hint: 'Build tool moderno con React',
    icon: 'pi-bolt',
    perSignalConfidence: 0.45,
    signals: [
      { type: 'fileExists', path: 'vite.config.js' },
      { type: 'fileExists', path: 'vite.config.ts' },
      { type: 'dep', dep: 'react' },
      { type: 'dep', dep: '@vitejs/plugin-react' },
    ],
  },
  {
    id: 'vite-vue',
    name: 'Vite + Vue',
    category: 'frontend',
    hint: 'Vite con Vue 3',
    icon: 'pi-bolt',
    perSignalConfidence: 0.45,
    signals: [
      { type: 'fileExists', path: 'vite.config.js' },
      { type: 'fileExists', path: 'vite.config.ts' },
      { type: 'dep', dep: 'vue' },
      { type: 'dep', dep: '@vitejs/plugin-vue' },
    ],
  },
  {
    id: 'create-react-app',
    name: 'Create React App',
    category: 'frontend',
    hint: 'React clásico (legacy)',
    icon: 'pi-prime',
    perSignalConfidence: 0.5,
    signals: [
      { type: 'dep', dep: 'react-scripts' },
    ],
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'fullstack',
    hint: 'Vue framework con SSR',
    icon: 'pi-bolt',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'nuxt.config.js' },
      { type: 'fileExists', path: 'nuxt.config.ts' },
      { type: 'dep', dep: 'nuxt' },
    ],
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'frontend',
    hint: 'Sitios con islas de contenido',
    icon: 'pi-star',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'astro.config.mjs' },
      { type: 'fileExists', path: 'astro.config.ts' },
      { type: 'fileExists', path: 'astro.config.js' },
      { type: 'dep', dep: 'astro' },
    ],
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    category: 'fullstack',
    hint: 'Framework de Svelte',
    icon: 'pi-bolt',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'svelte.config.js' },
      { type: 'dep', dep: '@sveltejs/kit' },
    ],
  },
  {
    id: 'remix',
    name: 'Remix',
    category: 'fullstack',
    hint: 'React full-stack framework',
    icon: 'pi-bolt',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'remix.config.js' },
      { type: 'dep', dep: '@remix-run/react' },
    ],
  },

  // -------------------------------------------------------------------------
  // Backend frameworks (Node)
  // -------------------------------------------------------------------------
  {
    id: 'express',
    name: 'Express',
    category: 'backend',
    hint: 'Minimal HTTP framework para Node',
    icon: 'pi-server',
    perSignalConfidence: 0.7,
    signals: [
      { type: 'dep', dep: 'express' },
    ],
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    category: 'backend',
    hint: 'Framework Node tipo Spring',
    icon: 'pi-server',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'dep', dep: '@nestjs/core' },
      { type: 'dep', dep: '@nestjs/common' },
      { type: 'fileExists', path: 'nest-cli.json' },
    ],
  },
  {
    id: 'fastify',
    name: 'Fastify',
    category: 'backend',
    hint: 'HTTP rápido para Node',
    icon: 'pi-server',
    perSignalConfidence: 0.7,
    signals: [{ type: 'dep', dep: 'fastify' }],
  },
  {
    id: 'hono',
    name: 'Hono',
    category: 'backend',
    hint: 'Backend ligero (edge-ready)',
    icon: 'pi-server',
    perSignalConfidence: 0.7,
    signals: [{ type: 'dep', dep: 'hono' }],
  },

  // -------------------------------------------------------------------------
  // Languages / runtimes
  // -------------------------------------------------------------------------
  {
    id: 'typescript',
    name: 'TypeScript',
    category: 'language',
    hint: 'JavaScript con tipos',
    icon: 'pi-code',
    perSignalConfidence: 0.5,
    signals: [
      { type: 'fileExists', path: 'tsconfig.json' },
      { type: 'dep', dep: 'typescript' },
    ],
  },
  {
    id: 'python',
    name: 'Python',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.55,
    signals: [
      { type: 'fileExists', path: 'requirements.txt' },
      { type: 'fileExists', path: 'pyproject.toml' },
      { type: 'fileExists', path: 'Pipfile' },
    ],
  },
  {
    id: 'django',
    name: 'Django',
    category: 'backend',
    hint: 'Web framework Python',
    icon: 'pi-server',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'manage.py' },
      { type: 'fileContent', path: 'requirements.txt', pattern: /^django(\s|=|>|<|~|$)/im },
    ],
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    category: 'backend',
    hint: 'API moderno en Python',
    icon: 'pi-server',
    perSignalConfidence: 0.7,
    signals: [
      { type: 'fileContent', path: 'requirements.txt', pattern: /^fastapi(\s|=|>|<|~|$)/im },
      { type: 'fileContent', path: 'pyproject.toml', pattern: /fastapi/i },
    ],
  },
  {
    id: 'flask',
    name: 'Flask',
    category: 'backend',
    hint: 'Microframework Python',
    icon: 'pi-server',
    perSignalConfidence: 0.7,
    signals: [
      { type: 'fileContent', path: 'requirements.txt', pattern: /^flask(\s|=|>|<|~|$)/im },
    ],
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    category: 'fullstack',
    hint: 'Framework Ruby',
    icon: 'pi-server',
    perSignalConfidence: 0.5,
    signals: [
      { type: 'fileExists', path: 'Gemfile' },
      { type: 'fileExists', path: 'config.ru' },
      { type: 'fileExists', path: 'bin/rails' },
    ],
  },
  {
    id: 'laravel',
    name: 'Laravel',
    category: 'fullstack',
    hint: 'Framework PHP',
    icon: 'pi-server',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'artisan' },
      { type: 'fileContent', path: 'composer.json', pattern: /laravel\/framework/ },
    ],
  },
  {
    id: 'php-composer',
    name: 'PHP (Composer)',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.7,
    signals: [{ type: 'fileExists', path: 'composer.json' }],
  },
  {
    id: 'go',
    name: 'Go',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.85,
    signals: [{ type: 'fileExists', path: 'go.mod' }],
  },
  {
    id: 'rust',
    name: 'Rust',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.85,
    signals: [{ type: 'fileExists', path: 'Cargo.toml' }],
  },
  {
    id: 'java-maven',
    name: 'Java (Maven)',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.7,
    signals: [{ type: 'fileExists', path: 'pom.xml' }],
  },
  {
    id: 'java-gradle',
    name: 'Java/Kotlin (Gradle)',
    category: 'language',
    icon: 'pi-code',
    perSignalConfidence: 0.55,
    signals: [
      { type: 'fileExists', path: 'build.gradle' },
      { type: 'fileExists', path: 'build.gradle.kts' },
    ],
  },
  {
    id: 'spring-boot',
    name: 'Spring Boot',
    category: 'backend',
    hint: 'Backend Java moderno',
    icon: 'pi-server',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileContent', path: 'pom.xml', pattern: /spring-boot/ },
      { type: 'fileContent', path: 'build.gradle', pattern: /spring-boot/ },
      { type: 'fileContent', path: 'build.gradle.kts', pattern: /spring-boot/ },
    ],
  },

  // -------------------------------------------------------------------------
  // Mobile
  // -------------------------------------------------------------------------
  {
    id: 'react-native',
    name: 'React Native',
    category: 'mobile',
    hint: 'Apps móviles con React',
    icon: 'pi-mobile',
    perSignalConfidence: 0.7,
    signals: [{ type: 'dep', dep: 'react-native' }],
  },
  {
    id: 'flutter',
    name: 'Flutter',
    category: 'mobile',
    hint: 'Apps móviles con Dart',
    icon: 'pi-mobile',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'fileExists', path: 'pubspec.yaml' },
      { type: 'fileContent', path: 'pubspec.yaml', pattern: /flutter:/ },
    ],
  },
  {
    id: 'expo',
    name: 'Expo',
    category: 'mobile',
    hint: 'Tooling para React Native',
    icon: 'pi-mobile',
    perSignalConfidence: 0.6,
    signals: [
      { type: 'dep', dep: 'expo' },
      { type: 'fileExists', path: 'app.json' },
    ],
  },

  // -------------------------------------------------------------------------
  // Databases / ORMs
  // -------------------------------------------------------------------------
  {
    id: 'mongoose',
    name: 'MongoDB (Mongoose)',
    category: 'tooling',
    hint: 'ODM para MongoDB en Node',
    icon: 'pi-database',
    perSignalConfidence: 0.9,
    signals: [{ type: 'dep', dep: 'mongoose' }],
  },
  {
    id: 'prisma',
    name: 'Prisma',
    category: 'tooling',
    hint: 'ORM tipado para Node',
    icon: 'pi-database',
    perSignalConfidence: 0.9,
    signals: [
      { type: 'dep', dep: 'prisma' },
      { type: 'dep', dep: '@prisma/client' },
    ],
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    category: 'tooling',
    hint: 'ORM SQL tipado',
    icon: 'pi-database',
    perSignalConfidence: 0.85,
    signals: [{ type: 'dep', dep: 'drizzle-orm' }],
  },

  // -------------------------------------------------------------------------
  // CSS / UI tooling
  // -------------------------------------------------------------------------
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'tooling',
    icon: 'pi-palette',
    perSignalConfidence: 0.8,
    signals: [
      { type: 'dep', dep: 'tailwindcss' },
      { type: 'fileExists', path: 'tailwind.config.js' },
      { type: 'fileExists', path: 'tailwind.config.ts' },
    ],
  },
  {
    id: 'primeng',
    name: 'PrimeNG',
    category: 'tooling',
    icon: 'pi-palette',
    perSignalConfidence: 0.9,
    signals: [{ type: 'dep', dep: 'primeng' }],
  },
];

/**
 * Manifest files we want to read content of (only when present at root)
 * so rules can inspect dependencies / contents.
 */
export const MANIFEST_FILES: ReadonlyArray<string> = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'Gemfile',
  'composer.json',
  'pubspec.yaml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'Cargo.toml',
];
