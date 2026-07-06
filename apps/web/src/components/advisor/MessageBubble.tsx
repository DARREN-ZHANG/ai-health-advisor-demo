'use client';

import { m } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { Message } from '@/stores/ai-advisor.store';

import { ChartTokenRenderer } from './ChartTokenRenderer';
import { MemoryCandidateCard } from './MemoryCandidateCard';

interface MessageBubbleProps {
  message: Message;
}

/**
 * 单条对话消息 —— Valo 视觉统一（I5.2）。
 *
 * 设计要点：
 * - 仅引用 `var(--valo-*)` token，不再使用散落的 slate-/blue-/red-/yellow- 类名。
 * - 状态色映射：
 *   error → `--valo-depleted`（红光谱，糖原耗尽）
 *   warning → `--valo-sluggish`（橙光谱，代谢迟缓）
 *   good / active → `--valo-active`（绿光谱，积极恢复）
 *   无状态 → 不渲染徽标。
 * - 行为完全保留：图表 token、记忆候选卡、framer-motion 入场动画。
 * - 稳定测试锚点：
 *   `data-valo-message-role` / `data-valo-message-id` / `data-valo-message-status` /
 *   `data-valo-message-source` / `data-valo-message-timestamp` /
 *   `data-valo-message-charts` / `data-valo-message-memory`。
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const t = useTranslations('advisor.statusLabel');
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  // 系统消息：居中淡化的提示气泡（错误 / 提示走 system 角色）。
  if (isSystem) {
    // 错误系统消息使用 depleted 色；普通提示使用 text-secondary。
    const isError = message.content.startsWith('发送失败');
    return (
      <div className="flex justify-center my-2">
        <span
          data-valo-message-role="system"
          data-valo-message-id={message.id}
          className={
            'inline-block rounded px-2 py-1 text-xs ' +
            (isError
              ? 'bg-[var(--valo-surface)] text-[var(--valo-depleted)] border border-[var(--valo-depleted)]/30'
              : 'bg-[var(--valo-surface)]/60 text-[var(--valo-text-secondary)]')
          }
        >
          {message.content}
        </span>
      </div>
    );
  }

  const sourceLabel = message.source === 'fallback'
    ? 'Fallback'
    : message.source === 'llm'
      ? 'AI Advisor'
      : message.source;

  const statusLabel = message.statusColor
    ? t(message.statusColor)
    : message.statusColor;

  // 状态色：error → depleted；warning → sluggish；其余（active/good）→ active。
  const statusColorVar =
    message.statusColor === 'error'
      ? 'var(--valo-depleted)'
      : message.statusColor === 'warning'
        ? 'var(--valo-sluggish)'
        : 'var(--valo-active)';

  // 源标签背景：surface + 文字次级。
  const sourceBadgeStyle = {
    backgroundColor: 'color-mix(in srgb, var(--valo-surface) 70%, transparent)',
    color: 'var(--valo-text-secondary)',
  } as const;

  return (
    <m.div
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      data-valo-message-role={message.role}
      data-valo-message-id={message.id}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}
    >
      <div
        className={`max-w-[85%] flex flex-col gap-1 ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={
            'px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ' +
            (isUser
              ? 'rounded-tr-none text-[var(--valo-canvas)]'
              : 'rounded-tl-none border border-[var(--valo-border)] text-[var(--valo-text-primary)]')
          }
          style={
            isUser
              ? { backgroundColor: 'var(--valo-prime)' }
              : { backgroundColor: 'var(--valo-surface)' }
          }
        >
          {message.content}
        </div>

        {isAssistant && message.chartTokens && message.chartTokens.length > 0 && (
          <div
            data-valo-message-charts="true"
            className="w-full mt-2 flex flex-col gap-2"
          >
            {message.chartTokens.map((token, idx) => (
              <ChartTokenRenderer key={idx} tokenId={token} />
            ))}
          </div>
        )}

        {isAssistant &&
          message.memoryCandidates &&
          message.memoryCandidates.length > 0 && (
            <div
              data-valo-message-memory="true"
              className="mt-2 flex w-full flex-col gap-2"
            >
              {message.memoryCandidates.map((candidate) => (
                <MemoryCandidateCard key={candidate.id} candidate={candidate} />
              ))}
            </div>
          )}

        <span
          data-valo-message-timestamp={new Date(message.timestamp).toISOString()}
          className="text-[10px] mt-1 px-1 flex items-center gap-2 text-[var(--valo-text-secondary)]"
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {message.statusColor && (
            <span
              data-valo-message-status={message.statusColor}
              className="rounded px-1.5 py-0.5 uppercase tracking-wider font-semibold"
              style={{
                color: statusColorVar,
                backgroundColor: `color-mix(in srgb, ${statusColorVar} 14%, transparent)`,
              }}
            >
              {statusLabel}
            </span>
          )}
          {message.source && (
            <span
              data-valo-message-source={message.source}
              className="rounded px-1.5 py-0.5 uppercase tracking-wider font-semibold"
              style={sourceBadgeStyle}
            >
              {sourceLabel}
            </span>
          )}
          {message.meta?.finishReason === 'fallback' && (
            <span
              className="flex items-center gap-1"
              style={{ color: 'var(--valo-sluggish)' }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: 'var(--valo-sluggish)' }}
              />
              Fallback
            </span>
          )}
        </span>
      </div>
    </m.div>
  );
}
