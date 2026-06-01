'use client';

import { Button } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';

export interface ActionOptionsProps {
  actions: ActionOption[];
  /** LLM 生成的区段标题，降级使用柔和默认文案 */
  sectionTitle?: string;
  onSelect: (action: ActionOption) => void | Promise<void>;
  onAddCalendar: (action: ActionOption) => void;
  pendingActionId?: string | null;
  selectedActionIds: ReadonlySet<string>;
  calendarActionIds: ReadonlySet<string>;
  disabled?: boolean;
}

export function ActionOptions({
  actions,
  sectionTitle,
  onSelect,
  onAddCalendar,
  pendingActionId,
  selectedActionIds,
  calendarActionIds,
  disabled = false,
}: ActionOptionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="space-y-2 pt-4 border-t border-slate-800/50">
      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <span className="w-1 h-3 bg-emerald-500 rounded-full" />
        {sectionTitle ?? '为你准备了一些灵感'}
      </p>
      <div className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            variant="ghost"
            aria-pressed={selectedActionIds.has(action.id)}
            disabled={disabled}
            onClick={() => {
              onSelect(action);
            }}
            className="w-full text-left flex items-start gap-3 py-3 px-4
                       border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5
                       transition-colors group"
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{action.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                  {action.title}
                </div>
                {action.interaction?.kind === 'calendar' && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddCalendar(action);
                    }}
                    className="ml-2 shrink-0 rounded border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
                  >
                    {calendarActionIds.has(action.id) ? '已添加' : '添加进日程'}
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {action.description}
              </div>
              <div className="text-xs text-slate-500 mt-1 italic">
                {action.aiPromise}
              </div>
              {pendingActionId === action.id ? (
                <div className="text-xs text-emerald-400 mt-2">正在更新实时简报...</div>
              ) : selectedActionIds.has(action.id) ? (
                <div className="text-xs text-emerald-400 mt-2">已记录</div>
              ) : null}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
