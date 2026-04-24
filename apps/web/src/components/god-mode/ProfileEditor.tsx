'use client';

import { useState } from 'react';
import { useProfileStore } from '@/stores/profile.store';
import { useProfileActions } from '@/hooks/use-profile-actions';
import { useGodModeState } from '@/hooks/use-god-mode-actions';

export function ProfileEditor() {
  const { currentProfile } = useProfileStore();
  const { data: godModeState } = useGodModeState();
  const {
    updateProfile,
    isUpdatingProfile,
    cloneProfile,
    isCloningProfile,
    deleteProfile,
    isDeletingProfile,
    resetProfile,
    isResettingProfile,
  } = useProfileActions();

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [newProfileId, setNewProfileId] = useState('');
  const [newProfileName, setNewProfileName] = useState('');

  if (!currentProfile) return null;

  const profileCount = godModeState?.availableProfiles?.length ?? 0;
  const isBusy = isUpdatingProfile || isCloningProfile || isDeletingProfile || isResettingProfile;

  const handleBlur = async (field: string, value: unknown) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { [field]: value },
      });
    } catch (error) {
      console.error('更新失败:', error);
    }
  };

  const handleBaselineBlur = async (field: string, value: number) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { baseline: { [field]: value } },
      });
    } catch (error) {
      console.error('基线更新失败:', error);
    }
  };

  const handleWeeklyBaselineBlur = async (field: string, value: number) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { weeklyBaseline: { [field]: value } },
      });
    } catch (error) {
      console.error('近一周基线更新失败:', error);
    }
  };

  const handleDailyBaselineBlur = async (field: string, value: number) => {
    if (isBusy) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes: { dailyBaseline: { [field]: value } },
      });
    } catch (error) {
      console.error('近24h基线更新失败:', error);
    }
  };

  const handleClone = async () => {
    if (!newProfileId.trim()) return;
    try {
      await cloneProfile({
        sourceProfileId: currentProfile.profileId,
        newProfileId: newProfileId.trim(),
        overrides: newProfileName.trim() ? { name: newProfileName.trim() } : undefined,
      });
      setCloneDialogOpen(false);
      setNewProfileId('');
      setNewProfileName('');
    } catch (error) {
      console.error('克隆失败:', error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `确定删除 Profile「${currentProfile.name}」？此操作不可恢复。`,
    );
    if (!confirmed) return;
    try {
      await deleteProfile({ profileId: currentProfile.profileId });
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      `确定恢复 Profile「${currentProfile.name}」到默认状态？将重新生成历史数据。`,
    );
    if (!confirmed) return;
    try {
      await resetProfile({ profileId: currentProfile.profileId });
    } catch (error) {
      console.error('恢复失败:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={() => setCloneDialogOpen(true)}
          disabled={isBusy}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          + 复制新建
        </button>
        <button
          onClick={handleReset}
          disabled={isBusy}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          {isResettingProfile ? '恢复中...' : '恢复默认'}
        </button>
      </div>

      {/* 基本信息 */}
      <div className="space-y-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">基本信息</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">姓名</label>
            <input
              key={currentProfile.profileId + currentProfile.name}
              defaultValue={currentProfile.name}
              onBlur={(e) => handleBlur('name', e.target.value)}
              disabled={isBusy}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">年龄</label>
            <input
              key={currentProfile.profileId + currentProfile.age}
              type="number"
              defaultValue={currentProfile.age}
              onBlur={(e) => handleBlur('age', Number(e.target.value))}
              disabled={isBusy}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">性别</label>
          <select
            key={currentProfile.profileId + currentProfile.gender}
            defaultValue={currentProfile.gender}
            onBlur={(e) => handleBlur('gender', e.target.value)}
            disabled={isBusy}
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="male">男</option>
            <option value="female">女</option>
          </select>
        </div>
      </div>

      {/* 基线指标 — 全局 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">基线指标</div>
          <span className="text-[9px] text-amber-500/70">修改将重生成 30 天数据</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">静息心率 (bpm)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.restingHr}
                type="number"
                defaultValue={currentProfile.baseline.restingHr}
                onBlur={(e) => handleBaselineBlur('restingHr', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">HRV (ms)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.hrv}
                type="number"
                defaultValue={currentProfile.baseline.hrv}
                onBlur={(e) => handleBaselineBlur('hrv', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">血氧 (%)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.spo2}
                type="number"
                defaultValue={currentProfile.baseline.spo2}
                onBlur={(e) => handleBaselineBlur('spo2', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">睡眠 (分钟)</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.avgSleepMinutes}
                type="number"
                defaultValue={currentProfile.baseline.avgSleepMinutes}
                onBlur={(e) => handleBaselineBlur('avgSleepMinutes', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">步数</label>
              <input
                key={currentProfile.profileId + currentProfile.baseline.avgSteps}
                type="number"
                defaultValue={currentProfile.baseline.avgSteps}
                onBlur={(e) => handleBaselineBlur('avgSteps', Number(e.target.value))}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-amber-500 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 基线指标 — 近一周 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">近一周基线指标</div>
          <span className="text-[9px] text-blue-500/70">修改将重生成最近 7 天数据</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">静息心率 (bpm)</label>
              <input
                key={currentProfile.profileId + (currentProfile.weeklyBaseline?.restingHr ?? '')}
                type="number"
                defaultValue={currentProfile.weeklyBaseline?.restingHr ?? ''}
                placeholder={String(currentProfile.baseline.restingHr)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleWeeklyBaselineBlur('restingHr', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">HRV (ms)</label>
              <input
                key={currentProfile.profileId + (currentProfile.weeklyBaseline?.hrv ?? '')}
                type="number"
                defaultValue={currentProfile.weeklyBaseline?.hrv ?? ''}
                placeholder={String(currentProfile.baseline.hrv)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleWeeklyBaselineBlur('hrv', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">血氧 (%)</label>
              <input
                key={currentProfile.profileId + (currentProfile.weeklyBaseline?.spo2 ?? '')}
                type="number"
                defaultValue={currentProfile.weeklyBaseline?.spo2 ?? ''}
                placeholder={String(currentProfile.baseline.spo2)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleWeeklyBaselineBlur('spo2', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">睡眠 (分钟)</label>
              <input
                key={currentProfile.profileId + (currentProfile.weeklyBaseline?.avgSleepMinutes ?? '')}
                type="number"
                defaultValue={currentProfile.weeklyBaseline?.avgSleepMinutes ?? ''}
                placeholder={String(currentProfile.baseline.avgSleepMinutes)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleWeeklyBaselineBlur('avgSleepMinutes', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">步数</label>
              <input
                key={currentProfile.profileId + (currentProfile.weeklyBaseline?.avgSteps ?? '')}
                type="number"
                defaultValue={currentProfile.weeklyBaseline?.avgSteps ?? ''}
                placeholder={String(currentProfile.baseline.avgSteps)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleWeeklyBaselineBlur('avgSteps', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 基线指标 — 近24h */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">近24h基线指标</div>
          <span className="text-[9px] text-emerald-500/70">修改将重生成最近 24h 数据</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">静息心率 (bpm)</label>
              <input
                key={currentProfile.profileId + (currentProfile.dailyBaseline?.restingHr ?? '')}
                type="number"
                defaultValue={currentProfile.dailyBaseline?.restingHr ?? ''}
                placeholder={String(currentProfile.baseline.restingHr)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleDailyBaselineBlur('restingHr', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">HRV (ms)</label>
              <input
                key={currentProfile.profileId + (currentProfile.dailyBaseline?.hrv ?? '')}
                type="number"
                defaultValue={currentProfile.dailyBaseline?.hrv ?? ''}
                placeholder={String(currentProfile.baseline.hrv)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleDailyBaselineBlur('hrv', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">血氧 (%)</label>
              <input
                key={currentProfile.profileId + (currentProfile.dailyBaseline?.spo2 ?? '')}
                type="number"
                defaultValue={currentProfile.dailyBaseline?.spo2 ?? ''}
                placeholder={String(currentProfile.baseline.spo2)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleDailyBaselineBlur('spo2', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">睡眠 (分钟)</label>
              <input
                key={currentProfile.profileId + (currentProfile.dailyBaseline?.avgSleepMinutes ?? '')}
                type="number"
                defaultValue={currentProfile.dailyBaseline?.avgSleepMinutes ?? ''}
                placeholder={String(currentProfile.baseline.avgSleepMinutes)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleDailyBaselineBlur('avgSleepMinutes', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500">步数</label>
              <input
                key={currentProfile.profileId + (currentProfile.dailyBaseline?.avgSteps ?? '')}
                type="number"
                defaultValue={currentProfile.dailyBaseline?.avgSteps ?? ''}
                placeholder={String(currentProfile.baseline.avgSteps)}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val !== '') handleDailyBaselineBlur('avgSteps', Number(val));
                }}
                disabled={isBusy}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-emerald-500 focus:outline-none disabled:opacity-50 placeholder:text-slate-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        disabled={isBusy || profileCount <= 1}
        className="w-full px-3 py-2 text-xs rounded-lg bg-red-950/30 border-2 border-red-900/30 text-red-400 hover:border-red-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isDeletingProfile ? '删除中...' : `删除此 Profile${profileCount <= 1 ? '（至少保留 1 个）' : ''}`}
      </button>

      {/* 克隆对话框 */}
      {cloneDialogOpen && (
        <div className="p-3 rounded-xl bg-slate-900/80 border-2 border-slate-700 space-y-2">
          <div className="text-xs text-slate-400 font-bold">复制新建</div>
          <input
            placeholder="新 Profile ID（小写字母/数字/连字符）"
            value={newProfileId}
            onChange={(e) => setNewProfileId(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none"
          />
          <input
            placeholder="名称（可选）"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleClone}
              disabled={isCloningProfile || !newProfileId.trim()}
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-50"
            >
              {isCloningProfile ? '创建中...' : '创建'}
            </button>
            <button
              onClick={() => {
                setCloneDialogOpen(false);
                setNewProfileId('');
                setNewProfileName('');
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
