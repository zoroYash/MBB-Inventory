import { Router } from 'express';
import { addAdmin, editProfile, changePassword } from '../controllers/user.controller';
import { validate } from '../middlewares/validate.middleware';
import { addAdminSchema, editProfileSchema, changePasswordSchema } from '../validations/auth.validation';
import { protect, authorizeSuperAdmin } from '../middlewares/auth.middleware';

const router = Router();

// All user routes require authentication
router.use(protect);

router.put('/profile', validate(editProfileSchema), editProfile);
router.put('/change-password', validate(changePasswordSchema), changePassword);

// Only Super Admin can hit this
router.post('/add-admin', authorizeSuperAdmin, validate(addAdminSchema), addAdmin);

export default router;