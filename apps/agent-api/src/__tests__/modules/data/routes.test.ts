import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

    test('当前日同步后 hrv tab 仍返回最近一天 HRV', async () => {
      const clock = app.runtime.overrideStore.getDemoClock('profile-a');
      const currentDate = clock.currentTime.slice(0, 10);
      const rawCurrentDay = app.runtime.getRawProfile('profile-a').records.find((record) => record.date === currentDate);

      expect(rawCurrentDay?.hrv).toBeDefined();

      try {
        app.runtime.overrideStore.performSync('profile-a', 'manual_refresh');
        const response = await app.inject({
          method: 'GET',
          url: `/profiles/profile-a/data?tab=hrv&timeframe=custom&startDate=${currentDate}&endDate=${currentDate}`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.timeline).toHaveLength(1);
        expect(body.data.timeline[0].values.hrv).toBe(rawCurrentDay!.hrv);
      } finally {
        app.runtime.overrideStore.reset('all');
      }
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
      expect(body.data[0].timeline.some((point: { values: Record<string, number | null> }) => point.values.hrv != null)).toBe(true);
      expect(body.data[1].token).toBe('SLEEP_7DAYS');
    });

    test('day timeframe 的 HRV chart-data 使用日级 HRV，不返回空 intraday', async () => {
      const clock = app.runtime.overrideStore.getDemoClock('profile-a');
      const currentDate = clock.currentTime.slice(0, 10);

      try {
        app.runtime.overrideStore.performSync('profile-a', 'manual_refresh');
        const response = await app.inject({
          method: 'GET',
          url: '/profiles/profile-a/chart-data?tokens=HRV_7DAYS&timeframe=day',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data[0].timeline).toHaveLength(1);
        expect(body.data[0].timeline[0].date).toBe(currentDate);
        expect(body.data[0].timeline[0].values.hrv).toEqual(expect.any(Number));
      } finally {
        app.runtime.overrideStore.reset('all');
      }
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

  describe('GET /profiles/:profileId/device-sync', () => {
    test('返回设备同步总览（初始状态含 baseline events）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/device-sync',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profileId).toBe('profile-a');
      expect(body.data.samplingIntervalMinutes).toBe(1);
      // 初始状态有 baseline sleep 事件（尚未同步）
      expect(body.data.totalDeviceSamples).toBeGreaterThan(0);
      expect(body.data.pendingDeviceSamples).toBeGreaterThan(0);
      expect(body.data.syncSessions).toHaveLength(0);
      expect(body.data.firstDeviceSampleAt).not.toBeNull();
      expect(body.data.lastDeviceSampleAt).not.toBeNull();
      expect(body.data.lastSyncedSampleAt).toBeNull();
    });
  });

  describe('GET /profiles/:profileId/device-sync/samples', () => {
    test('返回 pending 样本（含 baseline events）', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/device-sync/samples?scope=pending',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.scope).toBe('pending');
      expect(body.data.syncId).toBeNull();
      // baseline sleep 事件尚未同步，pending 不为空
      expect(body.data.sampleCount).toBeGreaterThan(0);
      expect(body.data.samples.length).toBeGreaterThan(0);
    });

    test('缺少 syncId 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/device-sync/samples?scope=sync-session',
      });

      expect(response.statusCode).toBe(400);
    });

    test('无效 scope 返回 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/device-sync/samples?scope=invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    test('未知同步批次返回 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/profiles/profile-a/device-sync/samples?scope=sync-session&syncId=missing',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
