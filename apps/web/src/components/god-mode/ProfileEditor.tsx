'use client';

import { useState } from 'react';
import { useProfileStore } from '@/stores/profile.store';
import { useProfileActions } from '@/hooks/use-profile-actions';
import { useGodModeState } from '@/hooks/use-god-mode-actions';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('godMode.profile');
  const tCommon = useTranslations('common');

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
      t('deleteConfirm', { name: localize(currentProfile.name, DEFAULT_LOCALE) })
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
      t('resetConfirm', { name: localize(currentProfile.name, DEFAULT_LOCALE) })
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
          {t('cloneNew')}
        </button>
        <button
          onClick={handleReset}
          disabled={isBusy}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          {isResettingProfile ? t('resetting') : t('resetToDefault')}
        </button>
      </div>

      {/* 基本信息 */}
      <div className="space-y-3">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{t('basicInfo')}</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">{t('name')}</label>
            <input
              key={currentProfile.profileId + localize(currentProfile.name, DEFAULT_LOCALE)}
              defaultValue={localize(currentProfile.name, DEFAULT_LOCALE)}
              onBlur={(e) => handleBlur('name', e.target.value)}
              disabled={isBusy}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">{t('age')}</label>
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
          <label className="text-[10px] text-slate-500">{t('gender')}</label>
          <select
            key={currentProfile.profileId + currentProfile.gender}
            defaultValue={currentProfile.gender}
            onBlur={(e) => handleBlur('gender', e.target.value)}
            disabled={isBusy}
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="male">{tCommon('male')}</option>
            <option value="female">{tCommon('female')}</option>
          </select>
        </div>
      </div>

      {/* 基线指标 — 全局 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{t('baselineMetrics')}</div>
          <span className="text-[9px] text-amber-500/70">{t('baselineWarning')}</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">{t('restingHr')}</label>
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
              <label className="text-[10px] text-slate-500">{t('hrv')}</label>
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
              <label className="text-[10px] text-slate-500">{t('spo2')}</label>
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
              <label className="text-[10px] text-slate-500">{t('sleepMinutes')}</label>
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
              <label className="text-[10px] text-slate-500">{t('steps')}</label>
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
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{t('weeklyBaseline')}</div>
          <span className="text-[9px] text-blue-500/70">{t('weeklyBaselineWarning')}</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">{t('restingHr')}</label>
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
              <label className="text-[10px] text-slate-500">{t('hrv')}</label>
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
              <label className="text-[10px] text-slate-500">{t('spo2')}</label>
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
              <label className="text-[10px] text-slate-500">{t('sleepMinutes')}</label>
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
              <label className="text-[10px] text-slate-500">{t('steps')}</label>
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
          <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{t('dailyBaseline')}</div>
          <span className="text-[9px] text-emerald-500/70">{t('dailyBaselineWarning')}</span>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500">{t('restingHr')}</label>
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
              <label className="text-[10px] text-slate-500">{t('hrv')}</label>
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
              <label className="text-[10px] text-slate-500">{t('spo2')}</label>
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
              <label className="text-[10px] text-slate-500">{t('sleepMinutes')}</label>
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
              <label className="text-[10px] text-slate-500">{t('steps')}</label>
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
        {isDeletingProfile ? t('deleting') : `${t('deleteButton')}${profileCount <= 1 ? t('deleteAtLeastOne') : ''}`}
      </button>

      {/* 克隆对话框 */}
      {cloneDialogOpen && (
        <div className="p-3 rounded-xl bg-slate-900/80 border-2 border-slate-700 space-y-2">
          <div className="text-xs text-slate-400 font-bold">{t('cloneDialogTitle')}</div>
          <input
            placeholder={t('newProfileIdPlaceholder')}
            value={newProfileId}
            onChange={(e) => setNewProfileId(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none"
          />
          <input
            placeholder={t('newProfileNamePlaceholder')}
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
              {isCloningProfile ? t('creating') : tCommon('create')}
            </button>
            <button
              onClick={() => {
                setCloneDialogOpen(false);
                setNewProfileId('');
                setNewProfileName('');
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
