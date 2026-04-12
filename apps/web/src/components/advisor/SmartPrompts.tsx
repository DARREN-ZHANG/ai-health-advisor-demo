'use client';

import { motion } from 'framer-motion';

interface SmartPromptsProps {
  onSelect: (prompt: string) => void;
}

const prompts = [
  '分析我昨晚的睡眠质量',
  '我最近的 HRV 趋势如何？',
  '给我的运动计划提点建议',
  '为什么我最近感觉压力很大？',
];

export function SmartPrompts({ onSelect }: SmartPromptsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      {prompts.map((prompt, idx) => (
        <motion.button
          key={idx}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect(prompt)}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700 text-xs text-slate-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
        >
          {prompt}
        </motion.button>
      ))}
    </div>
  );
}
