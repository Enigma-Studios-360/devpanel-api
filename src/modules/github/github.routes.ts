import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { githubController } from './github.controller';
import { 
  linkRepoSchema, 
  createIssueSchema, 
  listIssuesQuerySchema 
} from './github.validation';

const router = Router();

// Protegemos todas las rutas con el token del usuario autenticado
router.use(requireAuth);

// ==========================================
// MÓDULO DE GITHUB - RUTAS ACTIVAS
// ==========================================

// Vincular y desvincular repositorios
// Le decimos a la función validate que busque los datos en el 'body'
router.post('/api/projects/:projectId/github/link', validate(linkRepoSchema, 'body'), githubController.link);
router.delete('/api/projects/:projectId/github/link', githubController.unlink);

// Consultar información general
router.get('/api/projects/:projectId/github/info', githubController.info);

// Consultar commits y ramas
router.get('/api/projects/:projectId/github/commits', githubController.commits);
router.get('/api/projects/:projectId/github/branches', githubController.branches);

// Issues (Listar y Crear)
// Para listar issues, le decimos que valide los parámetros de la URL ('query')
router.get('/api/projects/:projectId/github/issues', validate(listIssuesQuerySchema, 'query'), githubController.issues);
router.post('/api/projects/:projectId/github/issues', validate(createIssueSchema, 'body'), githubController.createIssue);

export const githubRouter = router;
