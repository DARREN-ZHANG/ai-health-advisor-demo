'use client';

import { m } from 'framer-motion';

export interface SmartPromptOption {
  id: string;
  text: string;
}

interface SmartPromptsProps {
  onSelect: (prompt: SmartPromptOption) => void;
}

const prompts: SmartPromptOption[] = [
  { id: 'sleep-analysis', text: '分析我昨晚的睡眠质量' },
  { id: 'hrv-trends', text: '我最近的 HRV 趋势如何？' },
  { id: 'exercise-advice', text: '给我的运动计划提点建议' },
  { id: 'stress-inquiry', text: '为什么我最近感觉压力很大？' },
];

export function SmartPrompts({ onSelect }: SmartPromptsProps) {
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
