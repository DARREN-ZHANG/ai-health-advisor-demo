import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.FALLBACK_ONLY_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = DATA_DIR;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.FALLBACK_ONLY_MODE;
    delete process.env.NODE_ENV;
    delete process.env.DATA_DIR;
  });

  test('returns success envelope with health data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.timestamp).toBeTruthy();
  });

  test('includes version, env, provider fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    const body = response.json();
    expect(body.data.version).toBe('0.0.0');
    expect(body.data.env).toBe('test');
    expect(body.data.provider).toBe('openai');
    expect(body.data.fallbackOnly).toBe(true);
    expect(body.data.profilesLoaded).toBeGreaterThanOrEqual(3);
    expect(typeof body.data.uptimeMs).toBe('number');
  });

  test('response includes meta with requestId', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'health-test-req' },
    });
    const body = response.json();
    expect(body.meta.requestId).toBe('health-test-req');
    expect(body.meta.timestamp).toBeTruthy();
    expect(typeof body.meta.durationMs).toBe('number');
  });
});
