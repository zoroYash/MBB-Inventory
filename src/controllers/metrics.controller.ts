// src/controllers/metrics.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';
import { systemMetrics } from '../middlewares/metrics.middleware';
import mongoose from 'mongoose';

export const getMetrics = asyncHandler(async (req: Request, res: Response) => {
  const fullMetrics = {
    server: {
      uptimeSeconds: parseFloat(process.uptime().toFixed(2)),
      memoryUsageMB: parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    },
    traffic: systemMetrics,
  };

  sendSuccess(res, 200, fullMetrics, 'System metrics retrieved successfully');
});