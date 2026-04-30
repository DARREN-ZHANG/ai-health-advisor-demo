import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type Locale, DEFAULT_LOCALE, isValidLocale } from '@health-advisor/shared';

declare module 'fastify' {
  interface FastifyRequest {
    lang: Locale;
  }
}

export const langPlugin = fp(async function (app: FastifyInstance) {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const raw = request.headers['x-lang'] as string | undefined;
    request.lang = isValidLocale(raw) ? raw : DEFAULT_LOCALE;
  });
});
