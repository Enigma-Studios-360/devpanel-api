import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { searchController } from './search.controller';

export const searchRouter = Router();

// GET /api/search?q=...
searchRouter.get('/', requireAuth, searchController.search);
