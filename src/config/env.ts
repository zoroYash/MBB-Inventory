import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  MONGO_URI: z.string().min(1, "MongoDB URI is required"),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().min(10, "JWT Secret must be at least 10 characters long"),
  JWT_EXPIRES_IN: z.string().default('7'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  process.exit(1);
}

export const env = _env.data;
