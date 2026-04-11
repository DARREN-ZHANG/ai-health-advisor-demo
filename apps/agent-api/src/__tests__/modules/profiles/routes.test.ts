import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('Profile Routes', () => {
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

  describe('GET /profiles', () => {
    test('返回 profile 列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(3);
    });

    test('列表项包含 profileId 和 name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles',
      });
      const body = response.json();
      const first = body.data[0];
      expect(first).toHaveProperty('profileId');
      expect(first).toHaveProperty('name');
    });
  });

  describe('GET /profiles/:profileId', () => {
    test('返回完整 profile 数据', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.profileId).toBe('profile-a');
      expect(body.data.profile.name).toBe('张健康');
      expect(Array.isArray(body.data.records)).toBe(true);
      expect(body.data.records.length).toBeGreaterThan(0);
    });

    test('不存在的 profileId 返回 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('PROFILE_NOT_FOUND');
    });
  });
});
