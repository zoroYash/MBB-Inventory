// src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let error = { ...err };
  error.message = err.message || 'Internal Server Error';
  let validationErrors = null;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = new AppError('Resource not found', 404);
  }
  
  // Mongoose duplicate key
  if (err.code === 11000) {
    error = new AppError('Duplicate field value entered', 400);
  }
  
  // Mongoose Validation Error
  if (err.name === 'ValidationError' && err.errors) {
    const message = Object.values(err.errors).map((val: any) => val.message).join(', ');
    error = new AppError(message, 400);
  }
  
  // Zod Validation Error safely accessed using optional chaining and issues fallback
  if (err.name === 'ZodError') {
    error = new AppError('Validation failed', 400);
    const issues = err.issues || err.errors || [];
    validationErrors = issues.map((e: any) => ({ field: e.path.join('.'), message: e.message }));
  }

  const statusCode = error.statusCode || 500;
  const message = error.message;

  // Log 500 errors fully, but keep operational errors quiet
  if (statusCode >= 500) {
    logger.error(`[Unhandled Error] ${err.stack}`);
  } else {
    logger.warn(`[Operational Error] ${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(validationErrors && { errors: validationErrors }),
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};