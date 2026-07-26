import winston from 'winston';
import { env } from './env';

const formats = [
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
];

if (env.NODE_ENV === 'development') {
  formats.push(winston.format.colorize(), winston.format.simple());
}

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(...formats),
  transports: [new winston.transports.Console()],
});