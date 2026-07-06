'use client';

import { m } from 'framer-motion';
import { useTranslations } from 'next-intl';

export interface SmartPromptOption {
  id: string;
  text: string;
}

interface SmartPromptsProps {
  onSelect: (prompt: SmartPromptOption) => void;
}

const PROMPT_KEYS = [
  { id: 'sleep-analysis', textKey: 'sleepAnalysis' as const },
  { id: 'hrv-trends', textKey: 'hrvTrends' as const },
  { id: 'exercise-advice', textKey: 'exerciseAdvice' as const },
] as const;

/**
 * SmartPrompts —— 推荐问题胶囊芯片。
 *
 * 设计要点（I7.3 / P1-04）：
 * - 3 条胶囊形建议（与 design-manifest.md AI Chat 画板对齐），
 *   移除 stress-inquiry，保留 sleep / hrv / exercise 三个核心场景。
 * - 仅引用 `var(--valo-*)` token，无 blue-/slate- 散落类名。
 * - 静态态：`--valo-surface` + 弱边框 `--valo-border`，与背景同一光谱。
 * - hover/focus：边框切换到 `--valo-prime`，文字保持高对比。
 * - `<button>` 提供原生可访问语义；触屏 44px 最小目标由 `data-valo-touch`
 *   全局兜底；胶囊 `rounded-full` 形态由 `text-sm` + `px-4 py-2.5` 撑开。
 */
export function SmartPrompts({ onSelect }: SmartPromptsProps) {
  const t = useTranslations('advisor.smartPrompts');

  const prompts: SmartPromptOption[] = PROMPT_KEYS.map((item) => ({
    id: item.id,
    text: t(item.textKey),
  }));

  return (
    <div
      className="flex flex-wrap gap-2 py-2"
      data-valo-smart-prompts="true"
    >
      {prompts.map((prompt, index) => (
        <m.button
          key={prompt.id}
          type="button"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(prompt)}
          data-valo-touch="true"
          data-valo-prompt-id={prompt.id}
          aria-label={prompt.text}
          // 仅引用 Valo token：胶囊 rounded-full + 弱边框 → hover 切到 prime；文字 secondary → hover 切到 primary。
          className={
            'text-left text-sm rounded-full border px-4 py-2.5 transition-colors ' +
            'shadow-[var(--valo-shadow-card)] ' +
            'border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
            'text-[var(--valo-text-secondary)] ' +
            'hover:border-[var(--valo-prime)] hover:text-[var(--valo-text-primary)]'
          }
        >
          {prompt.text}
        </m.button>
      ))}
    </div>
  );
}
