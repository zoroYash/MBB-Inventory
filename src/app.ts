// src/app.ts
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { apiLimiter } from './middlewares/rateLimiter.middleware';
import { metricsMiddleware } from './middlewares/metrics.middleware';
import { connectDB } from './config/db';
import routes from './routes';

const app: Application = express();

app.set('trust proxy', 1);

// Connect to Database
connectDB();

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(compression());

// Logger & Metrics
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(metricsMiddleware); 

// Rate Limiter
app.use('/api', apiLimiter);

// Routes
app.use('/api', routes);

// 404 and Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
