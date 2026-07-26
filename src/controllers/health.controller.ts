import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/responseHandler';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60 }); // 60 seconds cache

export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  let cacheStatus = cache.get('health_metrics');

  if (!cacheStatus) {
    cacheStatus = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dbState: mongoose.connection.readyState, // 1 = connected
      timestamp: Date.now(),
    };
    cache.set('health_metrics', cacheStatus);
  }

  sendSuccess(res, 200, cacheStatus, 'System is healthy and running optimally');
});