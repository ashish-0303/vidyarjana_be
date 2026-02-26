import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  addAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword,
  getAllAdmins,
  deleteAdmin
} from '../controllers/adminController.js';
import { verifySuperadmin } from '../middlewares/verifySuperadmin.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10,
  message: { error: 'Too many login attempts, please try again later.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests, please try again later.' },
});

router.post('/login', loginLimiter, loginAdmin);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/', verifySuperadmin, addAdmin);
router.get('/', verifySuperadmin, getAllAdmins);
router.delete('/:id', verifySuperadmin, deleteAdmin);

export default router;