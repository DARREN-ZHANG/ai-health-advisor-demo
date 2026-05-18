'use client';

import { Button } from '@health-advisor/ui';
import type { ActionOption } from '@health-advisor/shared';
import { useState } from 'react';

interface ActionOptionsProps {
  actions: ActionOption[];
  /** LLM 生成的区段标题，降级使用柔和默认文案 */
  sectionTitle?: string;
  onSelect?: (action: ActionOption) => void;
}

export function ActionOptions({ actions, sectionTitle, onSelect }: ActionOptionsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            aria-pressed={selectedId === action.id}
            onClick={() => {
              setSelectedId(action.id);
              onSelect?.(action);
            }}
            className="w-full text-left flex items-start gap-3 py-3 px-4
                       border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5
                       transition-colors group"
          >
            <span className="text-lg flex-shrink-0 mt-0.5">{action.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                {action.title}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {action.description}
              </div>
              <div className="text-xs text-slate-500 mt-1 italic">
                {action.aiPromise}
              </div>
              {selectedId === action.id && (
                <div className="text-xs text-emerald-400 mt-2">
                  已记录
                </div>
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
