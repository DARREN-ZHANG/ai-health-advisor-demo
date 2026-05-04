'use client';

import { useState, useEffect, useMemo } from 'react';
import { useProfileStore } from '@/stores/profile.store';
import { useProfileActions } from '@/hooks/use-profile-actions';
import { useGodModeState } from '@/hooks/use-god-mode-actions';
import { localize, DEFAULT_LOCALE } from '@health-advisor/shared';
import { useTranslations } from 'next-intl';
import type { SandboxProfile } from '@health-advisor/shared';

interface BaselineDraft {
  restingHr: number | '';
  hrv: number | '';
  spo2: number | '';
  avgSleepMinutes: number | '';
  avgSteps: number | '';
}

interface ProfileDraft {
  name: string;
  age: number | '';
  gender: string;
  baseline: BaselineDraft;
  weeklyBaseline: BaselineDraft;
  dailyBaseline: BaselineDraft;
}

function buildBaselineDraft(source?: Partial<BaselineDraft>): BaselineDraft {
  return {
    restingHr: source?.restingHr ?? '',
    hrv: source?.hrv ?? '',
    spo2: source?.spo2 ?? '',
    avgSleepMinutes: source?.avgSleepMinutes ?? '',
    avgSteps: source?.avgSteps ?? '',
  };
}

function buildDraft(profile: SandboxProfile): ProfileDraft {
  return {
    name: localize(profile.name, DEFAULT_LOCALE),
    age: profile.age,
    gender: profile.gender,
    baseline: buildBaselineDraft(profile.baseline),
    weeklyBaseline: buildBaselineDraft(profile.weeklyBaseline),
    dailyBaseline: buildBaselineDraft(profile.dailyBaseline),
  };
}

function buildBaselineDiff(draft: BaselineDraft, original?: Partial<BaselineDraft>): Record<string, number> {
  const diff: Record<string, number> = {};
  (Object.keys(draft) as Array<keyof BaselineDraft>).forEach((key) => {
    const d = draft[key];
    const o = original?.[key];
    if (d !== '' && d !== o) {
      diff[key] = d;
    }
  });
  return diff;
}

function buildChanges(draft: ProfileDraft, original: SandboxProfile): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (draft.name !== localize(original.name, DEFAULT_LOCALE)) changes.name = draft.name;
  if (draft.age !== '' && draft.age !== original.age) changes.age = draft.age;
  if (draft.gender !== original.gender) changes.gender = draft.gender;

  const baselineDiff = buildBaselineDiff(draft.baseline, original.baseline);
  if (Object.keys(baselineDiff).length > 0) changes.baseline = baselineDiff;

  const weeklyDiff = buildBaselineDiff(draft.weeklyBaseline, original.weeklyBaseline);
  if (Object.keys(weeklyDiff).length > 0) changes.weeklyBaseline = weeklyDiff;

  const dailyDiff = buildBaselineDiff(draft.dailyBaseline, original.dailyBaseline);
  if (Object.keys(dailyDiff).length > 0) changes.dailyBaseline = dailyDiff;

  return changes;
}

interface ProfileEditorProps {
  disabled?: boolean;
}

export function ProfileEditor({ disabled = false }: ProfileEditorProps) {
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

  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [newProfileId, setNewProfileId] = useState('');
  const [newProfileName, setNewProfileName] = useState('');

  // 当切换 profile 时重置 draft
  useEffect(() => {
    if (currentProfile) {
      setDraft(buildDraft(currentProfile));
    }
  }, [currentProfile?.profileId]);

  const changes = useMemo(() => {
    if (!draft || !currentProfile) return {};
    return buildChanges(draft, currentProfile);
  }, [draft, currentProfile]);
  const hasChanges = Object.keys(changes).length > 0;

  if (!currentProfile || !draft) return null;

  const profileCount = godModeState?.availableProfiles?.length ?? 0;
  const isBusy = isUpdatingProfile || isCloningProfile || isDeletingProfile || isResettingProfile;
  const isFieldDisabled = isBusy || disabled;

  const handleBasicChange = (field: keyof Pick<ProfileDraft, 'name' | 'gender'>, value: string) => {
    setDraft((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleAgeChange = (value: string) => {
    setDraft((prev) => prev ? { ...prev, age: value === '' ? '' : Number(value) } : prev);
  };

  const handleBaselineChange = (
    category: 'baseline' | 'weeklyBaseline' | 'dailyBaseline',
    field: keyof BaselineDraft,
    value: string,
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [field]: value === '' ? '' : Number(value),
        },
      };
    });
  };

  const handleApply = async () => {
    if (!hasChanges) return;
    try {
      await updateProfile({
        profileId: currentProfile.profileId,
        changes,
      });
    } catch (error) {
      console.error('应用修改失败:', error);
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
          disabled={isFieldDisabled}
          className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border-2 border-slate-800 text-slate-400 hover:border-slate-700 transition-all disabled:opacity-50"
        >
          {t('cloneNew')}
        </button>
        <button
          onClick={handleReset}
          disabled={isFieldDisabled}
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
              value={draft.name}
              onChange={(e) => handleBasicChange('name', e.target.value)}
              disabled={isFieldDisabled}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">{t('age')}</label>
            <input
              type="number"
              value={draft.age}
              onChange={(e) => handleAgeChange(e.target.value)}
              disabled={isFieldDisabled}
              className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500">{t('gender')}</label>
          <select
            value={draft.gender}
            onChange={(e) => handleBasicChange('gender', e.target.value)}
            disabled={isFieldDisabled}
            className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            <option value="male">{tCommon('male')}</option>
            <option value="female">{tCommon('female')}</option>
          </select>
        </div>
      </div>

      {/* 基线指标 — 全局 */}
      <BaselineGroup
        title={t('baselineMetrics')}
        warning={t('baselineWarning')}
        warningColor="amber"
        values={draft.baseline}
        onChange={(field, value) => handleBaselineChange('baseline', field, value)}
        disabled={isFieldDisabled}
        t={t}
      />

      {/* 基线指标 — 近一周 */}
      <BaselineGroup
        title={t('weeklyBaseline')}
        warning={t('weeklyBaselineWarning')}
        warningColor="blue"
        values={draft.weeklyBaseline}
        placeholders={currentProfile.baseline}
        onChange={(field, value) => handleBaselineChange('weeklyBaseline', field, value)}
        disabled={isFieldDisabled}
        t={t}
      />

      {/* 基线指标 — 近24h */}
      <BaselineGroup
        title={t('dailyBaseline')}
        warning={t('dailyBaselineWarning')}
        warningColor="emerald"
        values={draft.dailyBaseline}
        placeholders={currentProfile.baseline}
        onChange={(field, value) => handleBaselineChange('dailyBaseline', field, value)}
        disabled={isFieldDisabled}
        t={t}
      />

      {/* 应用修改按钮 */}
      <button
        onClick={handleApply}
        disabled={!hasChanges || isUpdatingProfile || disabled}
        className="w-full px-3 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isUpdatingProfile ? t('applying') : t('applyChanges')}
      </button>

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        disabled={isFieldDisabled || profileCount <= 1}
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

interface BaselineGroupProps {
  title: string;
  warning: string;
  warningColor: 'amber' | 'blue' | 'emerald';
  values: BaselineDraft;
  placeholders?: Partial<BaselineDraft>;
  onChange: (field: keyof BaselineDraft, value: string) => void;
  disabled: boolean;
  t: (key: string) => string;
}

function BaselineGroup({ title, warning, warningColor, values, placeholders, onChange, disabled, t }: BaselineGroupProps) {
  const colorMap = {
    amber: 'text-amber-500/70 focus:border-amber-500',
    blue: 'text-blue-500/70 focus:border-blue-500',
    emerald: 'text-emerald-500/70 focus:border-emerald-500',
  };
  const focusClass = colorMap[warningColor];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{title}</div>
        <span className={`text-[9px] ${colorMap[warningColor].split(' ')[0]}`}>{warning}</span>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">{t('restingHr')}</label>
            <input
              type="number"
              value={values.restingHr}
              placeholder={placeholders?.restingHr !== undefined ? String(placeholders.restingHr) : undefined}
              onChange={(e) => onChange('restingHr', e.target.value)}
              disabled={disabled}
              className={`w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:outline-none disabled:opacity-50 placeholder:text-slate-600 ${focusClass}`}
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">{t('hrv')}</label>
            <input
              type="number"
              value={values.hrv}
              placeholder={placeholders?.hrv !== undefined ? String(placeholders.hrv) : undefined}
              onChange={(e) => onChange('hrv', e.target.value)}
              disabled={disabled}
              className={`w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:outline-none disabled:opacity-50 placeholder:text-slate-600 ${focusClass}`}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-slate-500">{t('spo2')}</label>
            <input
              type="number"
              value={values.spo2}
              placeholder={placeholders?.spo2 !== undefined ? String(placeholders.spo2) : undefined}
              onChange={(e) => onChange('spo2', e.target.value)}
              disabled={disabled}
              className={`w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:outline-none disabled:opacity-50 placeholder:text-slate-600 ${focusClass}`}
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">{t('sleepMinutes')}</label>
            <input
              type="number"
              value={values.avgSleepMinutes}
              placeholder={placeholders?.avgSleepMinutes !== undefined ? String(placeholders.avgSleepMinutes) : undefined}
              onChange={(e) => onChange('avgSleepMinutes', e.target.value)}
              disabled={disabled}
              className={`w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:outline-none disabled:opacity-50 placeholder:text-slate-600 ${focusClass}`}
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500">{t('steps')}</label>
            <input
              type="number"
              value={values.avgSteps}
              placeholder={placeholders?.avgSteps !== undefined ? String(placeholders.avgSteps) : undefined}
              onChange={(e) => onChange('avgSteps', e.target.value)}
              disabled={disabled}
              className={`w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-300 focus:outline-none disabled:opacity-50 placeholder:text-slate-600 ${focusClass}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
