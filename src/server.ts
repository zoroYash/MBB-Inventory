// src/server.ts
import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import mongoose from 'mongoose';

process.on('uncaughtException', (err: Error) => {
  logger.error(`[UNCAUGHT EXCEPTION] 💥 Server crashing: ${err.message}`);
  logger.error(err.stack);
 
  process.exit(1);
});

// Start the server
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server running in ${env.NODE_ENV} mode on url http://localhost:${env.PORT}`);
});


process.on('unhandledRejection', (err: Error) => {
  logger.error(`[UNHANDLED REJECTION] 💥 Shutting down: ${err.message}`);
  
  // Close server to stop accepting new requests, then close DB
  server.close(async () => {
    logger.info('HTTP server closed.');
    await mongoose.disconnect();
    logger.info('MongoDB disconnected.');
    process.exit(1);
  });
});

// 3. Graceful Shutdown Handler for Termination Signals
const gracefulShutdown = async (signal: string) => {
  logger.info(`👋 ${signal} received. Shutting down gracefully...`);
  
  // Force shutdown if it takes longer than 10 seconds
  const forceDrop = setTimeout(() => {
    logger.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    logger.info('✅ HTTP server closed. No longer accepting requests.');
    try {
      await mongoose.disconnect();
      logger.info('✅ MongoDB disconnected.');
      clearTimeout(forceDrop); // Clear the timeout if shutdown was successful
      process.exit(0);
    } catch (err) {
      logger.error('❌ Error during database disconnection', err);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Triggered by hosting platforms
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Triggered by Ctrl+C