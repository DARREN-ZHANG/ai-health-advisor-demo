'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ValoCard } from '@/components/valo/ValoCard';
import { useProfileStore } from '@/stores/profile.store';
import { useLifeLogStore } from '@/stores/life-log.store';
import {
  DEFAULT_QUICK_CUPS,
  LIFE_LOG_CATEGORY_ORDER,
  type LifeLogCategory,
  type LifeLogEntry,
} from '@/lib/life-log';
import { LifeLogCategorySection } from './LifeLogCategorySection';
import { LifeLogEntrySheet, type EntrySheetValues } from './LifeLogEntrySheet';

/**
 * 模块级空数组常量：当 profile 还没有任何条目时，selector 返回此引用，
 * 避免每次渲染都创建新数组导致 zustand 触发不必要的重渲染。
 */
const EMPTY_ENTRIES: ReadonlyArray<LifeLogEntry> = [];

/**
 * LifeLogPanel —— Life Log 顶层容器（profile-scoped，仅当前会话）。
 *
 * 数据流：
 * - `useProfileStore` 提供 `currentProfileId`。
 * - `useLifeLogStore` 提供 entries 与 add/update/delete/clear。
 * - 切换 profile 时 React 自动重新订阅，仅显示当前 profile 的条目。
 *
 * 浮层状态：
 * - `addFor` —— 当前打开的"自定义新增"类目（null 表示关闭）。
 * - `editingEntry` —— 当前编辑的 entry（null 表示关闭）。
 *
 * 互斥：add 与 edit 不会同时打开；打开 add 时若在 edit 状态，先关 edit。
 *
 * **不持久化**：刷新页面后 zustand 内存被清空，所有 entries 消失。这是
 * Life Log 作为交互式原型的设计意图，并非 bug。
 */
export function LifeLogPanel() {
  const t = useTranslations('lifeLog');
  const profileId = useProfileStore((s) => s.currentProfileId);

  // 注意：`selectEntriesForProfile` 每次调用都返回新数组（不可变），
  // 直接放进 zustand selector 会触发无限渲染（引用每次都不等）。
  // 因此先取稳定的 entries 数组（仅在实际内容变化时改变引用），
  // 再用 useMemo 在客户端做排序与分桶。
  const rawEntries = useLifeLogStore(
    (s) => s.entriesByProfile[profileId] ?? EMPTY_ENTRIES,
  );
  const addEntry = useLifeLogStore((s) => s.addEntry);
  const updateEntry = useLifeLogStore((s) => s.updateEntry);
  const deleteEntry = useLifeLogStore((s) => s.deleteEntry);

  // 浮层状态
  const [addFor, setAddFor] = useState<LifeLogCategory | null>(null);
  const [editingEntry, setEditingEntry] = useState<LifeLogEntry | null>(null);

  // 按时间倒序排序（最新在前）
  const entries = useMemo(() => {
    return [...rawEntries].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  }, [rawEntries]);

  // 按类目分桶（保持类目顺序）
  const entriesByType = useMemo(() => {
    const map: Record<LifeLogCategory, LifeLogEntry[]> = {
      caffeine: [],
      alcohol: [],
      hydration: [],
    };
    for (const e of entries) {
      map[e.type].push(e);
    }
    return map;
  }, [entries]);

  function handleQuickAdd(type: LifeLogCategory) {
    addEntry({
      profileId,
      type,
      cups: DEFAULT_QUICK_CUPS,
      timestamp: new Date().toISOString(),
    });
  }

  function handleOpenCustomAdd(type: LifeLogCategory) {
    setEditingEntry(null);
    setAddFor(type);
  }

  function handleOpenEdit(entry: LifeLogEntry) {
    setAddFor(null);
    setEditingEntry(entry);
  }

  function handleClose() {
    setAddFor(null);
    setEditingEntry(null);
  }

  function handleSubmitAdd(values: EntrySheetValues) {
    if (addFor) {
      addEntry({
        profileId,
        type: addFor,
        cups: values.cups,
        timestamp: values.timestamp,
        note: values.note,
      });
    } else if (editingEntry) {
      updateEntry(profileId, editingEntry.id, {
        cups: values.cups,
        timestamp: values.timestamp,
        note: values.note,
      });
    }
    handleClose();
  }

  function handleDelete(entry: LifeLogEntry) {
    deleteEntry(profileId, entry.id);
  }

  return (
    <ValoCard as="section" aria-label={t('title')} data-valo-life-log-panel="">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[var(--valo-text-primary)]">
            {t('title')}
          </h2>
          <span
            className="text-[10px] uppercase tracking-widest
                       text-[var(--valo-text-secondary)]"
            data-valo-life-log-session-badge=""
          >
            {t('sessionOnlyBadge')}
          </span>
        </div>
      </header>

      <div className="space-y-3">
        {LIFE_LOG_CATEGORY_ORDER.map((type) => (
          <LifeLogCategorySection
            key={type}
            type={type}
            entries={entriesByType[type]}
            onQuickAdd={handleQuickAdd}
            onCustomAdd={handleOpenCustomAdd}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {(addFor || editingEntry) && (
        <LifeLogEntrySheet
          open
          type={(addFor ?? editingEntry?.type) as LifeLogCategory}
          initialEntry={editingEntry}
          onSubmit={handleSubmitAdd}
          onClose={handleClose}
        />
      )}
    </ValoCard>
  );
}
