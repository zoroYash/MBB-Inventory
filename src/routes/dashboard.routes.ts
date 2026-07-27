import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware';
import { getDashboardStats } from '../controllers/dashboard.controller';

const router = Router();

// All inventory routes require a logged-in admin/super_admin
router.use(protect);

// Dashboard Analytics Route (Place before parameterized routes if any conflicts arise)
router.get('/stats', getDashboardStats); 


export default router;