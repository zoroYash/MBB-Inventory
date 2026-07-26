import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';

export const addAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, email, password } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new AppError('User with this email already exists', 400));
  }

  const newAdmin = await User.create({
    name,
    email,
    password,
    role: 'admin',
  });

  const data = { id: newAdmin._id, name: newAdmin.name, email: newAdmin.email, role: newAdmin.role };
  sendSuccess(res, 201, data, 'Admin added successfully');
});

export const editProfile = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, email } = req.body;

  // Check if new email belongs to someone else
  if (email && email !== req.user?.email) {
    const emailTaken = await User.findOne({ email });
    if (emailTaken) {
      return next(new AppError('Email is already in use by another account', 400));
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    { name, email },
    { new: true, runValidators: true }
  );

  sendSuccess(res, 200, updatedUser, 'Profile updated successfully');
});

export const changePassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { oldPassword, newPassword } = req.body;
  
  const user = await User.findById(req.user?._id).select('+password +jwtVersion');
  
  if (!user || !(await user.comparePassword(oldPassword))) {
    return next(new AppError('Incorrect current password', 401));
  }

  user.password = newPassword;
  user.jwtVersion += 1; // 🔐 Instantly invalidates all other active sessions!
  await user.save();

  sendSuccess(res, 200, null, 'Password changed successfully. Please log in again.');
});