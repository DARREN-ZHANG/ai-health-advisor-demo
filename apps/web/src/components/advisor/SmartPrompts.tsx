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
  { id: 'stress-inquiry', textKey: 'stressInquiry' as const },
] as const;

export function SmartPrompts({ onSelect }: SmartPromptsProps) {
  const t = useTranslations('advisor.smartPrompts');

  const prompts: SmartPromptOption[] = PROMPT_KEYS.map((item) => ({
    id: item.id,
    text: t(item.textKey),
  }));

  return (
    <div className="flex flex-wrap gap-2 py-2">
      {prompts.map((prompt, index) => (
        <m.button
          key={prompt.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onSelect(prompt)}
          className="text-left px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/50 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5 transition-all shadow-sm active:bg-blue-500/10"
        >
          {prompt.text}
        </m.button>
      ))}
    </div>
  );
}
