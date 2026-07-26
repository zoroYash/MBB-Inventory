// src/middlewares/metrics.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// In-memory store for local metrics
export const systemMetrics = {
  totalRequests: 0,
  totalErrors: 0,
  averageResponseTimeMs: 0,
  routeStats: {} as Record<string, { count: number; avgTime: number }>,
};

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = process.hrtime();
  systemMetrics.totalRequests++;

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const responseTime = parseFloat((diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2));
    
    // Log it
    logger.info(`[Metrics] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Time: ${responseTime}ms`);

    // Track errors
    if (res.statusCode >= 400) systemMetrics.totalErrors++;

    // Calculate global average response time
    systemMetrics.averageResponseTimeMs = parseFloat(
      ((systemMetrics.averageResponseTimeMs * (systemMetrics.totalRequests - 1) + responseTime) / systemMetrics.totalRequests).toFixed(2)
    );

    // Track per-route stats
    const route = `${req.method} ${req.route ? req.route.path : req.path}`;
    if (!systemMetrics.routeStats[route]) {
      systemMetrics.routeStats[route] = { count: 0, avgTime: 0 };
    }
    
    const stats = systemMetrics.routeStats[route];
    stats.count++;
    stats.avgTime = parseFloat(((stats.avgTime * (stats.count - 1) + responseTime) / stats.count).toFixed(2));
  });

  next();
};