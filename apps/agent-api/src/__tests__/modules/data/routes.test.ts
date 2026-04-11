import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const DATA_DIR = path.resolve(process.cwd(), '../../data/sandbox');

describe('Data Routes', () => {
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

  describe('GET /profiles/:profileId/timeline', () => {
    test('返回 timeline 数据', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=week',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profileId).toBe('profile-a');
      expect(body.data.range).toHaveProperty('start');
      expect(body.data.range).toHaveProperty('end');
      expect(Array.isArray(body.data.records)).toBe(true);
    });

    test('无效 timeframe 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/timeline?timeframe=invalid',
      });
      expect(response.statusCode).toBe(400);
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/nonexistent/timeline?timeframe=week',
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /profiles/:profileId/data', () => {
    test('hrv tab 返回 timeline 数据', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/data?tab=hrv&timeframe=week',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.tab).toBe('hrv');
      expect(Array.isArray(body.data.timeline)).toBe(true);
    });

    test('stress tab 返回 StressTimelineResponse', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-c/data?tab=stress&timeframe=month',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.points)).toBe(true);
      expect(body.data.summary).toHaveProperty('average');
      expect(body.data.summary).toHaveProperty('max');
      expect(body.data.summary).toHaveProperty('min');
      expect(body.data.summary).toHaveProperty('trend');
    });

    test('无效 tab 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/data?tab=invalid',
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /profiles/:profileId/chart-data', () => {
    test('返回图表数据', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/chart-data?tokens=HRV_7DAYS,SLEEP_7DAYS&timeframe=week',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].token).toBe('HRV_7DAYS');
      expect(body.data[1].token).toBe('SLEEP_7DAYS');
    });

    test('无有效 token 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/chart-data?tokens=INVALID_TOKEN',
      });
      expect(response.statusCode).toBe(400);
    });

    test('空 tokens 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/chart-data',
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
