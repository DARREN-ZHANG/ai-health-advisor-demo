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
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {prompts.map((prompt) => (
        <m.button
          key={prompt.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(prompt)}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
        >
          {prompt.text}
        </m.button>
      ))}
    </div>
  );
}
