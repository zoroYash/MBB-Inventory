import { Router } from 'express';
import { login, logout, getMe } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema } from '../validations/auth.validation';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', protect, getMe);

export default router;