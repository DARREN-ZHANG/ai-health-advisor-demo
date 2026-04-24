import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const SOURCE_DATA_DIR = path.resolve(import.meta.dirname, '../../../../../../data/sandbox');

describe('Profile CRUD Routes', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    // 复制数据目录到临时目录，避免测试修改原始数据
    dataDir = mkdtempSync(path.join(tmpdir(), 'profile-crud-test-'));
    cpSync(SOURCE_DATA_DIR, dataDir, { recursive: true });

    process.env.FALLBACK_ONLY_MODE = 'true';
    process.env.ENABLE_GOD_MODE = 'true';
    process.env.NODE_ENV = 'test';
    process.env.DATA_DIR = dataDir;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.FALLBACK_ONLY_MODE;
    delete process.env.ENABLE_GOD_MODE;
    delete process.env.NODE_ENV;
    delete process.env.DATA_DIR;
  });

  describe('PUT /god-mode/profiles/:profileId', () => {
    test('更新 profile 基本字段返回 200', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { name: '测试用户' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.name).toBe('测试用户');
      expect(body.data.regenerated).toBe(false);

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });
    });

    test('更新 baseline 触发 history 重生成', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { baseline: { restingHr: 70 } },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.baseline.restingHr).toBe(70);
      expect(body.data.regenerated).toBe(true);

      // 恢复
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/nonexistent',
        payload: { name: '测试' },
      });

      expect(response.statusCode).toBe(404);
    });

    test('无效字段值返回 400', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { age: -1 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/profiles', () => {
    afterEach(async () => {
      // 清理可能创建的测试 profile
      try {
        await app.inject({
          method: 'DELETE',
          url: '/god-mode/profiles/test-clone',
        });
      } catch {
        // 忽略清理失败
      }
    });

    test('克隆 profile 返回 200', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
          overrides: { name: '克隆用户' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profileId).toBe('test-clone');
      expect(body.data.name).toBe('克隆用户');

      // 验证 manifest 中存在新 profile
      const stateResponse = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });
      const state = stateResponse.json();
      const profileIds = state.data.availableProfiles.map((p: { profileId: string }) => p.profileId);
      expect(profileIds).toContain('test-clone');
    });

    test('重复 profileId 返回 409', async () => {
      // 先创建一个
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
        },
      });

      // 再创建同 ID 的
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-clone',
        },
      });

      expect(response.statusCode).toBe(409);
    });

    test('非法 profileId 格式返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'INVALID_ID',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    test('缺少 sourceProfileId 返回 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: { newProfileId: 'test-clone' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /god-mode/profiles/:profileId', () => {
    test('删除 profile 返回 200', async () => {
      // 先克隆一个用于删除
      await app.inject({
        method: 'POST',
        url: '/god-mode/profiles',
        payload: {
          sourceProfileId: 'profile-a',
          newProfileId: 'test-delete',
        },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/test-delete',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.deletedProfileId).toBe('test-delete');
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    test('删除最后一个 profile 返回 400', async () => {
      // 删除到只剩 1 个
      await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-c',
      });

      await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-b',
      });

      // 此时只剩 1 个
      const response = await app.inject({
        method: 'DELETE',
        url: '/god-mode/profiles/profile-a',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /god-mode/profiles/:profileId/reset', () => {
    test('恢复 profile 到默认返回 200', async () => {
      // 先修改
      await app.inject({
        method: 'PUT',
        url: '/god-mode/profiles/profile-a',
        payload: { name: '已修改' },
      });

      // 恢复
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/profile-a/reset',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.profile.name).toBe('张健康');
      expect(body.data.regenerated).toBe(true);
    });

    test('不存在的 profile 返回 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/god-mode/profiles/nonexistent/reset',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /god-mode/state — availableProfiles', () => {
    test('返回 availableProfiles 列表', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/god-mode/state',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.availableProfiles)).toBe(true);
      expect(body.data.availableProfiles.length).toBeGreaterThanOrEqual(1);
      expect(body.data.availableProfiles[0]).toHaveProperty('profileId');
      expect(body.data.availableProfiles[0]).toHaveProperty('name');
    });
  });
});
