import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';
import { getMetrics } from '../controllers/metrics.controller';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.get('/health',protect, healthCheck);
router.get('/metrics',protect, getMetrics);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

export default router;