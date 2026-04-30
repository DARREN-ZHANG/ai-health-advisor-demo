'use client';

import { m } from 'framer-motion';
import {
  SignalIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { DeviceSyncOverview } from '@/hooks/use-device-sync';
import { useTranslations } from 'next-intl';

interface DeviceStatusBarProps {
  deviceData: DeviceSyncOverview | null | undefined;
  isLoading: boolean;
  error: boolean;
}

export function DeviceStatusBar({ deviceData, isLoading, error }: DeviceStatusBarProps) {
  const t = useTranslations('dataCenter');
  const tCommon = useTranslations('common');

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-800 animate-pulse">
        <div className="w-4 h-4 rounded-full bg-slate-700" />
        <div className="h-3 w-24 bg-slate-700 rounded" />
      </div>
    );
  }

  if (error || !deviceData) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
        <ExclamationTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
        <span className="text-xs font-medium text-red-400">{t('deviceError')}</span>
      </div>
    );
  }

  const hasSyncSessions = deviceData.syncSessions.length > 0;
  const hasPending = deviceData.pendingDeviceSamples > 0;
  const lastSynced = deviceData.lastSyncedSampleAt;

  // 状态判定
  let status: 'connected' | 'pending' | 'disconnected' = 'disconnected';
  if (hasSyncSessions && !hasPending) status = 'connected';
  else if (hasSyncSessions && hasPending) status = 'pending';

  const statusConfig = {
    connected: {
      icon: SignalIcon,
      labelKey: 'deviceConnected' as const,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/10',
      dot: 'bg-emerald-400',
    },
    pending: {
      icon: ArrowPathIcon,
      labelKey: 'deviceSyncing' as const,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/5',
      border: 'border-yellow-500/10',
      dot: 'bg-yellow-400',
    },
    disconnected: {
      icon: ExclamationTriangleIcon,
      labelKey: 'deviceDisconnected' as const,
      color: 'text-red-400',
      bg: 'bg-red-500/5',
      border: 'border-red-500/10',
      dot: 'bg-red-400',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <m.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl ${config.bg} border ${config.border}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`relative shrink-0 ${config.color}`}>
          <Icon className="w-4 h-4" />
          {status !== 'disconnected' && (
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${config.dot} ring-1 ring-slate-950`} />
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`text-xs font-semibold ${config.color}`}>{t(config.labelKey)}</span>
          {lastSynced && (
            <span className="text-[10px] text-slate-500 truncate">
              {t('lastSync', { time: formatRelativeTime(lastSynced, tCommon) })}
            </span>
          )}
        </div>
      </div>

      {hasPending && (
        <span className="shrink-0 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 text-[10px] font-bold">
          {t('pendingSync', { count: deviceData.pendingDeviceSamples })}
        </span>
      )}
    </m.div>
  );
}

function formatRelativeTime(isoString: string, t: (key: string, params?: { count?: number }) => string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return t('justNow');
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  if (diffHour < 24) return t('hoursAgo', { count: diffHour });
  if (diffDay < 7) return t('daysAgo', { count: diffDay });

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
