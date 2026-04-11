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

    await app.register(cors, {
      origin: config.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:5173']
        : false,
      credentials: true,
    });

    await app.register(helmet, {
      contentSecurityPolicy: false,
    });
  },
  { name: 'cors-plugin' },
);
