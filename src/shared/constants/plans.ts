export const PLANS = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
  TEAM: 'TEAM',
  SCHOOL: 'SCHOOL',
} as const;

export type PlanCode = (typeof PLANS)[keyof typeof PLANS];

export const PLAN_VALUES: PlanCode[] = Object.values(PLANS);

export interface PlanLimits {
  maxProjects: number;
  maxMembers: number;
  maxStorageMb: number;
  maxTasks: number | null;
  canDownloadReadme: boolean;
  canUseGithubPrivateRepos: boolean;
  canUseAdvancedDeployWizard: boolean;
}

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  FREE: {
    maxProjects: 1,
    maxMembers: 3,
    maxStorageMb: 100,
    maxTasks: 50,
    canDownloadReadme: false,
    canUseGithubPrivateRepos: false,
    canUseAdvancedDeployWizard: false,
  },
  STARTER: {
    maxProjects: 3,
    maxMembers: 5,
    maxStorageMb: 500,
    maxTasks: 200,
    canDownloadReadme: true,
    canUseGithubPrivateRepos: false,
    canUseAdvancedDeployWizard: true,
  },
  PRO: {
    maxProjects: 10,
    maxMembers: 10,
    maxStorageMb: 2048,
    maxTasks: null,
    canDownloadReadme: true,
    canUseGithubPrivateRepos: true,
    canUseAdvancedDeployWizard: true,
  },
  TEAM: {
    maxProjects: 25,
    maxMembers: 25,
    maxStorageMb: 10240,
    maxTasks: null,
    canDownloadReadme: true,
    canUseGithubPrivateRepos: true,
    canUseAdvancedDeployWizard: true,
  },
  SCHOOL: {
    maxProjects: 50,
    maxMembers: 100,
    maxStorageMb: 20480,
    maxTasks: null,
    canDownloadReadme: true,
    canUseGithubPrivateRepos: true,
    canUseAdvancedDeployWizard: true,
  },
};

export const PLAN_CATALOG = [
  {
    code: PLANS.FREE,
    name: 'Free',
    priceMonthly: 0,
    description: 'Para empezar y probar la plataforma.',
    highlights: [
      '1 equipo',
      '1 proyecto activo',
      '3 integrantes',
      '100 MB de archivos',
    ],
  },
  {
    code: PLANS.STARTER,
    name: 'Starter',
    priceMonthly: 9,
    description: 'Para freelancers y proyectos personales.',
    highlights: [
      '3 proyectos',
      '5 integrantes',
      '500 MB de archivos',
      'README descargable',
      'Deploy Wizard básico',
    ],
  },
  {
    code: PLANS.PRO,
    name: 'Pro',
    priceMonthly: 19,
    description: 'Para equipos pequeños profesionales.',
    highlights: [
      '10 proyectos',
      '10 integrantes',
      '2 GB de archivos',
      'GitHub privado',
      'Documentación avanzada',
    ],
  },
  {
    code: PLANS.TEAM,
    name: 'Team',
    priceMonthly: 49,
    description: 'Para equipos en crecimiento.',
    highlights: [
      '25 proyectos',
      '25 integrantes',
      '10 GB de archivos',
      'Roles avanzados',
      'GitHub avanzado',
    ],
  },
  {
    code: PLANS.SCHOOL,
    name: 'School',
    priceMonthly: null,
    description: 'Personalizado para profesores y escuelas.',
    highlights: [
      'Cuotas personalizadas',
      'Cuentas para alumnos',
      'Reportes por alumno (próximamente)',
    ],
  },
] as const;
