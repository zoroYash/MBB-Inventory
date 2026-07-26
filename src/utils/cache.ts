// src/utils/cache.ts
import NodeCache from 'node-cache';
import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from './responseHandler';

// Global cache instance
export const appCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

/**
 * Middleware to cache API responses
 * @param duration Cache duration in seconds
 */
export const routeCache = (duration: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `__express__${req.originalUrl || req.url}`;
    const cachedResponse = appCache.get(key);

    if (cachedResponse) {
      return sendSuccess(res, 200, cachedResponse, 'Data retrieved from cache');
    }

    // Override res.json to intercept the response and cache it
    const originalJson = res.json.bind(res);
    res.json = (body: any): Response => {
      // Only cache successful responses (where our standard format has success: true)
      if (body && body.success) {
        appCache.set(key, body.data, duration);
      }
      return originalJson(body);
    };

    next();
  };
};