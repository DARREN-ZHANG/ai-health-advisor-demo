'use client';

import { m } from 'framer-motion';
import type { Message } from '@/stores/ai-advisor.store';

import { ChartTokenRenderer } from './ChartTokenRenderer';
import { MemoryCandidateCard } from './MemoryCandidateCard';
import { PlanDraftCard } from './PlanDraftCard';

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
 * - 计划消息是排他的响应形态：存在 planDraft 时，只展示结构化计划与操作区，
 *   不再叠加通用回复气泡、图表或记忆候选卡。
 * - 稳定测试锚点：
 *   `data-valo-message-role` / `data-valo-message-id` / `data-valo-message-status` /
 *   `data-valo-message-source` / `data-valo-message-timestamp` /
 *   `data-valo-message-charts` / `data-valo-message-memory`。
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const isPlanResponse = isAssistant && Boolean(message.planDraft);

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
        {!isPlanResponse && (
          <div
            data-valo-message-content="true"
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
        )}

        {isAssistant &&
          !isPlanResponse &&
          message.chartTokens &&
          message.chartTokens.length > 0 && (
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
          !isPlanResponse &&
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

        {isAssistant && message.planDraft && (
          <PlanDraftCard planDraft={message.planDraft} />
        )}

        <span
          data-valo-message-timestamp={new Date(message.timestamp).toISOString()}
          className="text-[10px] mt-1 px-1 flex items-center gap-2 text-[var(--valo-text-secondary)]"
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </m.div>
  );
}
