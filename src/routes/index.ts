import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';
import { getMetrics } from '../controllers/metrics.controller';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import inventoryRoutes from './inventory.routes';
import dashboardRoutes from './dashboard.routes';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.get('/health',protect, healthCheck);
router.get('/metrics',protect, getMetrics);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/dashboard', dashboardRoutes);
export default router;