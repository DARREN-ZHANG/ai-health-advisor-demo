'use client';

import { useEffect, useState } from 'react';

/**
 * 轮播词表（两 locale 同词，不入 messages）。
 * 顺序固定，按用户给出顺序循环；不随机打乱。
 */
const THINKING_WORDS = [
  'Thinking',
  'Hatching',
  'Pondering',
  'Reasoning',
  'Analyzing',
  'Evaluating',
] as const;

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_FADE_MS = 400;

export interface ThinkingTextProps {
  /** 每个词的展示时长（ms），默认 3000 */
  intervalMs?: number;
  /** 渐隐 / 渐现时长（ms），默认 400 */
  fadeMs?: number;
}

/**
 * ThinkingText —— LLM loading 期间圆心轮播文案。
 *
 * 状态机（淡出 → 切词 → 淡入）：
 * - 挂载即显示 THINKING_WORDS[0]（'Thinking'），visible=true
 * - setInterval(intervalMs)：到点 setVisible(false) 渐隐；
 *   setTimeout(fadeMs) 后 setIndex(i+1 % len) + setVisible(true) 切词并渐现
 * - intervalMs(3000) > fadeMs(400)，保证下次 cycle 触发前 swap 已完成，不重入
 * - cleanup 同时清 interval + swap timer，卸载安全
 *
 * 无障碍：圆环 <button> 已有 aria-label（覆盖可见文案）+ aria-busy，
 * 可见文案本就不被 SR 朗读；这里 aria-hidden 防止轮播每 3s 刷屏。
 */
export function ThinkingText({
  intervalMs = DEFAULT_INTERVAL_MS,
  fadeMs = DEFAULT_FADE_MS,
}: ThinkingTextProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let swapTimer: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false); // 渐隐
      swapTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % THINKING_WORDS.length);
        setVisible(true); // 切词 + 渐现
      }, fadeMs);
    }, intervalMs);

    return () => {
      clearInterval(cycle);
      clearTimeout(swapTimer);
    };
  }, [intervalMs, fadeMs]);

  return (
    <span
      aria-hidden="true"
      className="transition-opacity ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${fadeMs}ms`,
      }}
    >
      {THINKING_WORDS[index]}
    </span>
  );
}
