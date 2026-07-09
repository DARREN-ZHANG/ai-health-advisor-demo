'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  buildLifeLogTimelinePayload,
  buildMockTimestamp,
  getTimeOfDay,
  LIFE_LOG_CATEGORY_ORDER,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';
import { useGodModeActions, useGodModeState } from '@/hooks/use-god-mode-actions';
import { useLifeLogStore } from '@/stores/life-log.store';
import { useProfileStore } from '@/stores/profile.store';
import { useUIStore } from '@/stores/ui.store';
import { LifeLogCategoryDialog } from './LifeLogCategoryDialog';
import { LifeLogCategorySection } from './LifeLogCategorySection';
import { LifeLogEntrySheet, type EntrySheetValues } from './LifeLogEntrySheet';

const EMPTY_ENTRIES: ReadonlyArray<LifeLogEntry> = [];

export function LifeLogPanel() {
  const t = useTranslations('lifeLog');
  const profileId = useProfileStore((state) => state.currentProfileId);
  const showToast = useUIStore((state) => state.showToast);
  const rawEntries = useLifeLogStore(
    (state) => state.entriesByProfile[profileId] ?? EMPTY_ENTRIES,
  );
  const addEntry = useLifeLogStore((state) => state.addEntry);
  const updateEntry = useLifeLogStore((state) => state.updateEntry);
  const deleteEntry = useLifeLogStore((state) => state.deleteEntry);
  const { data: godModeState } = useGodModeState();
  const {
    appendTimeline,
    removeTimelineSegment,
    isAppendingTimeline,
    isRemovingTimelineSegment,
  } = useGodModeActions();

  const [activeCategory, setActiveCategory] =
    useState<LifeLogCategory | null>(null);
  const [addFor, setAddFor] = useState<LifeLogCategory | null>(null);
  const [editingEntry, setEditingEntry] = useState<LifeLogEntry | null>(null);
  const currentDemoTime = godModeState?.currentDemoTime ?? '';
  const pending = isAppendingTimeline || isRemovingTimelineSegment;

  const entries = useMemo(
    () => [...rawEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [rawEntries],
  );
  const entriesByType = useMemo(() => {
    const result: Record<LifeLogCategory, LifeLogEntry[]> = {
      caffeine: [],
      alcohol: [],
      hydration: [],
    };
    entries.forEach((entry) => result[entry.type].push(entry));
    return result;
  }, [entries]);

  function requireDemoTime(): string | null {
    if (currentDemoTime) return currentDemoTime;
    showToast(t('demoTimeUnavailable'), 'error');
    return null;
  }

  async function persistEntry(
    type: LifeLogCategory,
    values: EntrySheetValues,
    existing?: LifeLogEntry,
  ) {
    const demoTime = requireDemoTime();
    if (!demoTime) return;

    try {
      const payload = buildLifeLogTimelinePayload(
        type,
        values.cups,
        values.timeOfDay,
      );
      const result = await appendTimeline({
        ...payload,
        replaceSegmentId: existing?.timelineSegmentId,
      });
      if (!result.lastTimelineSegmentId) {
        throw new Error('Timeline append did not return a segment id');
      }
      const timestamp = buildMockTimestamp(demoTime, values.timeOfDay);

      if (existing) {
        updateEntry(profileId, existing.id, {
          cups: values.cups,
          timestamp,
          timelineSegmentId: result.lastTimelineSegmentId,
        });
      } else {
        addEntry({
          profileId,
          type,
          cups: values.cups,
          timestamp,
          timelineSegmentId: result.lastTimelineSegmentId,
        });
      }
      setAddFor(null);
      setEditingEntry(null);
    } catch (error) {
      console.error('Failed to persist life log entry:', error);
      showToast(t('operationFailed'), 'error');
    }
  }

  async function handleQuickAdd(type: LifeLogCategory) {
    const demoTime = requireDemoTime();
    if (!demoTime) return;
    await persistEntry(type, {
      cups: 1,
      timeOfDay: getTimeOfDay(demoTime),
    });
  }

  async function handleDelete() {
    if (!editingEntry?.timelineSegmentId) {
      showToast(t('operationFailed'), 'error');
      return;
    }
    try {
      await removeTimelineSegment(editingEntry.timelineSegmentId);
      deleteEntry(profileId, editingEntry.id);
      setEditingEntry(null);
    } catch (error) {
      console.error('Failed to delete life log entry:', error);
      showToast(t('operationFailed'), 'error');
    }
  }

  return (
    <section aria-label={t('title')} data-valo-life-log-panel="">
      <div aria-hidden={activeCategory ? true : undefined}>
        <header className="mb-4 space-y-1">
          <h2
            className="text-lg leading-6 text-[var(--valo-text-primary)]"
            data-valo-serif="true"
          >
            {t('title')}
          </h2>
          <span className="sr-only">{t('sessionOnlyBadge')}</span>
          <p className="max-w-[32ch] text-xs leading-4 text-[var(--valo-text-secondary)]">
            {t('description')}
          </p>
        </header>

        <div className="space-y-2">
          {LIFE_LOG_CATEGORY_ORDER.map((type) => (
            <LifeLogCategorySection
              key={type}
              type={type}
              entries={entriesByType[type]}
              onOpen={setActiveCategory}
            />
          ))}
        </div>
      </div>

      {activeCategory && !addFor && !editingEntry ? (
        <LifeLogCategoryDialog
          type={activeCategory}
          entries={entriesByType[activeCategory]}
          pending={pending || !currentDemoTime}
          onClose={() => setActiveCategory(null)}
          onQuickAdd={() => void handleQuickAdd(activeCategory)}
          onCustomAdd={() => setAddFor(activeCategory)}
          onEdit={setEditingEntry}
        />
      ) : null}

      {addFor || editingEntry ? (
        <LifeLogEntrySheet
          open
          type={addFor ?? editingEntry!.type}
          defaultTime={getTimeOfDay(currentDemoTime)}
          initialEntry={editingEntry}
          pending={pending}
          onSubmit={(values) =>
            void persistEntry(addFor ?? editingEntry!.type, values, editingEntry ?? undefined)
          }
          onDelete={editingEntry ? () => void handleDelete() : undefined}
          onClose={() => {
            setAddFor(null);
            setEditingEntry(null);
          }}
        />
      ) : null}
    </section>
  );
}
