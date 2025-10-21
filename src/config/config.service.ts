import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenvConfig();

const configSchema = z.object({
  bot: z.object({
    token: z.string().min(1, 'Bot token is required'),
    webhookUrl: z.string().url().optional(),
  }),
  server: z.object({
    port: z.number().int().positive().default(3000),
    host: z.string().default('0.0.0.0'),
  }),
  database: z.object({
    url: z.string().default('file:./dev.db'),
  }),
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(6379),
    password: z.string().optional(),
    db: z.number().int().min(0).default(0),
  }),
  app: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    environment: z.enum(['development', 'production', 'test']).default('development'),
  }),
});

type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    bot: {
      token: process.env.BOT_TOKEN || '',
      webhookUrl: process.env.WEBHOOK_URL,
    },
    server: {
      port: process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8916,
      host: process.env.HOST || '0.0.0.0',
    },
    database: {
      url: process.env.DATABASE_URL || 'file:./dev.db',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : 6379,
      password: process.env.REDIS_PASSWORD,
      db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : 0,
    },
    app: {
      logLevel: (process.env.LOG_LEVEL as any) || (process.env.NODE_ENV === 'production' ? 'info' : 'warn'),
      environment: (process.env.NODE_ENV as any) || 'development',
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
}

export const config = loadConfig();
