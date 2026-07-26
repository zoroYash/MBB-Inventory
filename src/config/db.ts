// src/config/db.ts
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

let isConnected = false;

// Set up connection event listeners (Only needs to happen once)
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB connection lost. Retrying...');
  isConnected = false;
});

mongoose.connection.on('reconnected', () => {
  logger.info('🔄 MongoDB reconnected successfully.');
  isConnected = true;
});

mongoose.connection.on('error', (err) => {
  logger.error(`❌ MongoDB connection error: ${err.message}`);
});

export const connectDB = async () => {
  if (isConnected) {
    logger.debug('=> Using existing database connection');
    return;
  }

  try {
    const db = await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: env.NODE_ENV === 'production' ? 10 : 5, // Optimize for serverless/local
      serverSelectionTimeoutMS: 5000, // Keep trying to send initial operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
    });
    
    isConnected = db.connections[0].readyState === 1;
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB. Make sure your IP is whitelisted and internet is active.');
    
    // In local development, if we fail the VERY FIRST connection, we should exit.
    // But if we drop connection LATER, the event listeners above handle it.
    if (env.NODE_ENV === 'development') {
      logger.error(error);
      process.exit(1); 
    }
    throw error;
  }
};
