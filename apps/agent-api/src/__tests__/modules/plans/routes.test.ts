import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import type { PlanDraftInput } from '@health-advisor/shared';

const SOURCE_DATA_DIR = path.resolve(import.meta.dirname, '../../../../../../data/sandbox');

const validDraft: PlanDraftInput = {
  title: '7 天恢复计划',
  summary: '本周以稳定 HRV 与改善睡眠为主。',
  groups: [
    {
      title: '第 1 天',
      tasks: [
        { title: '餐后散步 15 分钟', estimatedMinutes: 15 },
        { title: '记录晨起 HRV' },
      ],
    },
    {
      title: '第 2 天',
      tasks: [{ title: '23:00 前入睡', suggestedTimeOfDay: '夜间' }],
    },
  ],
};

async function saveDraft(
  app: FastifyInstance,
  sessionId: string,
  profileId: string,
  draft: PlanDraftInput,
) {
  const response = await app.inject({
    method: 'POST',
    url: `/sessions/${sessionId}/profiles/${profileId}/plans/draft`,
    payload: draft,
  });
  expect(response.statusCode).toBe(200);
  const body = response.json();
  return body.data as { draftId: string };
}

describe('Plan Routes', () => {
  let app: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'plan-routes-test-'));
    cpSync(SOURCE_DATA_DIR, dataDir, { recursive: true });
    app = await buildApp({
      env: {
        FALLBACK_ONLY_MODE: 'true',
        ENABLE_GOD_MODE: 'true',
        NODE_ENV: 'test',
        DATA_DIR: dataDir,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe('POST /sessions/:sessionId/profiles/:profileId/plans/draft', () => {
    test('accepts valid draft and returns draftId', async () => {
      const draft = await saveDraft(app, 'sess-1', 'profile-a', validDraft);
      expect(draft.draftId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('rejects empty groups with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions/sess-1/profiles/profile-a/plans/draft',
        payload: { title: 'x', summary: 'y', groups: [] },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    test('rejects unknown extra fields with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/sessions/sess-1/profiles/profile-a/plans/draft',
        payload: { ...validDraft, extra: 'bad' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('execute + get current + patch task + delete', () => {
    test('full lifecycle on the same profile', async () => {
      const { draftId } = await saveDraft(app, 'sess-2', 'profile-a', validDraft);

      // execute
      const exec = await app.inject({
        method: 'POST',
        url: `/sessions/sess-2/profiles/profile-a/plans/drafts/${draftId}/execute`,
      });
      expect(exec.statusCode).toBe(200);
      const plan = exec.json().data;
      expect(plan.version).toBe(1);
      expect(plan.status).toBe('active');

      // get current
      const current = await app.inject({
        method: 'GET',
        url: '/sessions/sess-2/profiles/profile-a/plans/current',
      });
      expect(current.statusCode).toBe(200);
      expect(current.json().data.id).toBe(plan.id);

      // patch first task to completed
      const groupId = plan.groups[0].id;
      const taskId = plan.groups[0].tasks[0].id;
      const patch = await app.inject({
        method: 'PATCH',
        url: `/sessions/sess-2/profiles/profile-a/plans/${plan.id}/groups/${groupId}/tasks/${taskId}`,
        payload: { expectedVersion: plan.version, completed: true },
      });
      expect(patch.statusCode).toBe(200);
      const patched = patch.json().data;
      expect(patched.version).toBe(plan.version + 1);
      expect(patched.groups[0].tasks[0].completed).toBe(true);

      // delete current
      const del = await app.inject({
        method: 'DELETE',
        url: '/sessions/sess-2/profiles/profile-a/plans/current',
      });
      expect(del.statusCode).toBe(200);

      // current is null after delete
      const after = await app.inject({
        method: 'GET',
        url: '/sessions/sess-2/profiles/profile-a/plans/current',
      });
      expect(after.json().data).toBeNull();
    });
  });

  describe('execute on revoked draft', () => {
    test('returns 404 for replaced draftId', async () => {
      const first = await saveDraft(app, 'sess-3', 'profile-a', validDraft);
      const second = await saveDraft(app, 'sess-3', 'profile-a', validDraft);

      const execFirst = await app.inject({
        method: 'POST',
        url: `/sessions/sess-3/profiles/profile-a/plans/drafts/${first.draftId}/execute`,
      });
      expect(execFirst.statusCode).toBe(404);
      expect(execFirst.json().error.code).toBe('NOT_FOUND');

      // second draft can still be executed
      const execSecond = await app.inject({
        method: 'POST',
        url: `/sessions/sess-3/profiles/profile-a/plans/drafts/${second.draftId}/execute`,
      });
      expect(execSecond.statusCode).toBe(200);
    });
  });

  describe('replace in-progress plan', () => {
    test('returns 409 when overwriting without confirmReplace', async () => {
      const a = await saveDraft(app, 'sess-4', 'profile-a', validDraft);
      await app.inject({
        method: 'POST',
        url: `/sessions/sess-4/profiles/profile-a/plans/drafts/${a.draftId}/execute`,
      });

      const b = await saveDraft(app, 'sess-4', 'profile-a', validDraft);
      const exec = await app.inject({
        method: 'POST',
        url: `/sessions/sess-4/profiles/profile-a/plans/drafts/${b.draftId}/execute`,
      });
      expect(exec.statusCode).toBe(409);
      expect(exec.json().error.code).toBe('CONFLICT');

      // with confirmReplace=true succeeds
      const confirmed = await app.inject({
        method: 'POST',
        url: `/sessions/sess-4/profiles/profile-a/plans/drafts/${b.draftId}/execute`,
        payload: { confirmReplace: true },
      });
      expect(confirmed.statusCode).toBe(200);
    });
  });

  describe('task patch version mismatch', () => {
    test('returns 409 when expectedVersion does not match', async () => {
      const { draftId } = await saveDraft(app, 'sess-5', 'profile-a', validDraft);
      const exec = await app.inject({
        method: 'POST',
        url: `/sessions/sess-5/profiles/profile-a/plans/drafts/${draftId}/execute`,
      });
      const plan = exec.json().data;
      const groupId = plan.groups[0].id;
      const taskId = plan.groups[0].tasks[0].id;

      // bump version once
      await app.inject({
        method: 'PATCH',
        url: `/sessions/sess-5/profiles/profile-a/plans/${plan.id}/groups/${groupId}/tasks/${taskId}`,
        payload: { expectedVersion: plan.version, completed: true },
      });

      // stale version → 409
      const stale = await app.inject({
        method: 'PATCH',
        url: `/sessions/sess-5/profiles/profile-a/plans/${plan.id}/groups/${groupId}/tasks/${taskId}`,
        payload: { expectedVersion: plan.version, completed: false },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('CONFLICT');
    });
  });

  describe('profile isolation', () => {
    test('profile-a plan is invisible to profile-b in same session', async () => {
      const { draftId } = await saveDraft(app, 'sess-iso', 'profile-a', validDraft);
      await app.inject({
        method: 'POST',
        url: `/sessions/sess-iso/profiles/profile-a/plans/drafts/${draftId}/execute`,
      });
      const other = await app.inject({
        method: 'GET',
        url: '/sessions/sess-iso/profiles/profile-b/plans/current',
      });
      expect(other.statusCode).toBe(200);
      expect(other.json().data).toBeNull();
    });
  });
});
