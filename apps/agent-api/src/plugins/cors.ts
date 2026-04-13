import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

export const corsPlugin = fp<{
  config: AppConfig;
}>(
  async function (app: FastifyInstance, opts) {
    const { config } = opts;
    const allowedOrigins = new Set(config.CORS_ALLOWED_ORIGINS);

    if (config.NODE_ENV === 'development') {
      allowedOrigins.add('http://localhost:3000');
      allowedOrigins.add('http://localhost:5173');
    }

    await app.register(cors, {
      origin: allowedOrigins.size > 0 ? [...allowedOrigins] : false,
      credentials: true,
      exposedHeaders: ['X-Session-Id'],
    });

    await app.register(helmet, {
      contentSecurityPolicy: false,
    });
  },
  { name: 'cors-plugin' },
);
