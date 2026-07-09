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
 * SmartPrompts —— Figma 空态的三条建议胶囊。
 *
 * 设计稿参数：
 * - 高度 33px、圆角 40px、填充 `#434459`
 * - 正文 `SF Pro 14 / Regular / #FFFFFF`
 * - 顺序垂直堆叠，宽度按内容 hug
 */
export function SmartPrompts({ onSelect }: SmartPromptsProps) {
  const t = useTranslations('advisor.smartPrompts');

  const prompts: SmartPromptOption[] = PROMPT_KEYS.map((item) => ({
    id: item.id,
    text: t(item.textKey),
  }));

  return (
    <div
      className="flex flex-col items-start gap-3"
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
          data-valo-prompt-id={prompt.id}
          aria-label={prompt.text}
          className={
            'max-w-full rounded-full px-4 py-2 text-left text-[14px] leading-[17px] ' +
            'text-[var(--valo-text-primary)] transition-opacity hover:opacity-90 ' +
            'focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)]'
          }
          style={{ backgroundColor: 'var(--valo-chat-chip)' }}
        >
          {prompt.text}
        </m.button>
      ))}
    </div>
  );
}
