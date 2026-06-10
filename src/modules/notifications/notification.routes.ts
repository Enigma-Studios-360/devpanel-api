import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { notificationController } from './notification.controller';

const router = Router();
router.use(requireAuth);

// Bell dropdown — supports ?onlyUnread=true&page=1&perPage=20.
router.get('/', notificationController.list);
// Cheap probe the topbar polls every ~30s.
router.get('/unread-count', notificationController.unreadCount);

router.post('/mark-all-read', notificationController.markAllRead);
router.post('/:id/read', notificationController.markRead);
router.delete('/:id', notificationController.remove);

export const notificationRouter = router;
