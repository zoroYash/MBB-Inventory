// src/controllers/auth.controller.ts
import { Request, Response,NextFunction } from 'express';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';

const generateTokenAndSetCookie = (user: any, res: Response) => {
  const token = jwt.sign(
    { id: user._id, version: user.jwtVersion }, 
    env.JWT_SECRET, 
    { expiresIn: parseInt(env.JWT_EXPIRES_IN) * 24 * 60 * 60 } 
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return token;
};

export const login = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  const token = generateTokenAndSetCookie(user, res);

  const userData: any = { 
id: user._id, 
name: user.name, 
email: user.email, 
role: user.role 
  };

  if (env.NODE_ENV === 'development') {
    userData.token = token;
  }

  sendSuccess(res, 200, userData, 'Login successful');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000), 
    httpOnly: true,
  });
  sendSuccess(res, 200, null, 'User logged out successfully');
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, 200, req.user, 'Current user retrieved');
});