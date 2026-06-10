import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { assistantController } from './assistant.controller';
import { chatSchema } from './assistant.validation';

const router = Router();

// All assistant endpoints require an authenticated user — both for
// rate-limiting attribution and to keep this off of the public surface.
router.use(requireAuth);

router.get('/status', assistantController.status);
router.post('/chat', validate(chatSchema), assistantController.chat);

export const assistantRouter = router;
