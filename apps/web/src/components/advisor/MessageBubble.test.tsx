import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AgentTaskType } from '@health-advisor/shared';
import type { Message } from '@/stores/ai-advisor.store';
import { MessageBubble } from './MessageBubble';

/**
 * MessageBubble 单元测试（I5.2 + I7.1）。
 *
 * 覆盖：
 * - data-valo-message-* 锚点齐全。
 * - 仅引用 var(--valo-*)，无散落的 slate-/blue-/red-/yellow- 类名。
 * - 三种角色（user/assistant/system）的视觉分支。
 * - 状态色映射（error/warning/active）。
 * - 状态文案通过 i18n 翻译（I7.1：advisor.statusLabel.*）。
 * - chartTokens / memoryCandidates 子节点 data 锚点（不渲染图表本身）。
 */

// ChartTokenRenderer / MemoryCandidateCard 依赖 React Query / 数据 hook，
// 单测 MessageBubble 时把它们 stub 掉，只关心外壳是否挂出 data 锚点。
vi.mock('./ChartTokenRenderer', () => ({
  ChartTokenRenderer: ({ tokenId }: { tokenId: string }) => (
    <div data-mock-chart-token={tokenId} />
  ),
}));

vi.mock('./MemoryCandidateCard', () => ({
  MemoryCandidateCard: ({ candidate }: { candidate: { id: string } }) => (
    <div data-mock-memory-card={candidate.id} />
  ),
}));

vi.mock('./PlanDraftCard', () => ({
  PlanDraftCard: () => <div data-mock-plan-draft="true" />,
}));

const MESSAGES = {
  advisor: {
    statusLabel: {
      error: 'Serious',
      warning: 'Concern',
      good: 'Active',
    },
  },
} as const;

// I7.1 起 MessageBubble 通过 useTranslations 取状态文案，需要 provider。
function renderBubble(message: Message) {
  return render(
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      <MessageBubble message={message} />
    </NextIntlClientProvider>,
  );
}

function baseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    role: 'user',
    content: 'hello',
    timestamp: new Date('2026-07-05T08:30:00Z').getTime(),
    ...overrides,
  };
}

describe('MessageBubble', () => {
  afterEach(() => cleanup());

  // ---------- data 锚点 ----------

  it('user 消息挂出 data-valo-message-role="user" 与 message-id', () => {
    renderBubble(baseMessage({ role: 'user', id: 'u1' }));
    const node = document.querySelector('[data-valo-message-role="user"]');
    expect(node).not.toBeNull();
    expect(node?.getAttribute('data-valo-message-id')).toBe('u1');
  });

  it('assistant 消息挂出 data-valo-message-role="assistant"', () => {
    renderBubble(baseMessage({ role: 'assistant', id: 'a1' }));
    expect(
      document.querySelector('[data-valo-message-role="assistant"]'),
    ).not.toBeNull();
  });

  it('system 消息挂出 data-valo-message-role="system"', () => {
    renderBubble(baseMessage({ role: 'system', content: '系统提示' }));
    expect(
      document.querySelector('[data-valo-message-role="system"]'),
    ).not.toBeNull();
  });

  it('挂出 data-valo-message-timestamp（ISO 字符串）', () => {
    const ts = new Date('2026-07-05T08:30:00Z').getTime();
    renderBubble(baseMessage({ timestamp: ts }));
    const node = document.querySelector('[data-valo-message-timestamp]');
    expect(node?.getAttribute('data-valo-message-timestamp')).toBe(
      new Date(ts).toISOString(),
    );
  });

  // ---------- 状态色映射 ----------
  // 设计变更：状态徽标（ACTIVE/CONCERN 等）与身份徽标（AI Advisor）已从消息底部移除，
  // 无论 statusColor / source 如何取值都不再渲染。下列用例锁定这一行为。

  it('error statusColor 不再渲染状态徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', statusColor: 'error' }));
    expect(document.querySelector('[data-valo-message-status]')).toBeNull();
  });

  it('warning statusColor 不再渲染状态徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', statusColor: 'warning' }));
    expect(document.querySelector('[data-valo-message-status]')).toBeNull();
  });

  it('good statusColor 不再渲染状态徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', statusColor: 'good' }));
    expect(document.querySelector('[data-valo-message-status]')).toBeNull();
  });

  it('无 statusColor 时不渲染状态徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', statusColor: undefined }));
    expect(document.querySelector('[data-valo-message-status]')).toBeNull();
  });

  // ---------- source 徽标 ----------

  it('source="llm" 不再渲染 source 徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', source: 'llm' }));
    expect(document.querySelector('[data-valo-message-source]')).toBeNull();
  });

  it('source="fallback" 不再渲染 source 徽标', () => {
    renderBubble(baseMessage({ role: 'assistant', source: 'fallback' }));
    expect(document.querySelector('[data-valo-message-source]')).toBeNull();
  });

  // ---------- token-only colors ----------

  it('user 气泡背景使用 var(--valo-prime)，文字 var(--valo-canvas)', () => {
    renderBubble(baseMessage({ role: 'user', content: 'bubble-content' }));
    // 气泡 div 是包含消息文本的元素。
    const bubble = Array.from(
      document.querySelectorAll('[data-valo-message-role="user"] div'),
    ).find((el) => el.textContent === 'bubble-content') as
      | HTMLElement
      | undefined;
    expect(bubble).toBeDefined();
    const style = bubble?.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-prime)');
    expect(bubble?.className ?? '').toContain('text-[var(--valo-canvas)]');
  });

  it('assistant 气泡使用 var(--valo-surface) + border + text-primary', () => {
    renderBubble(
      baseMessage({ role: 'assistant', content: 'assistant-bubble' }),
    );
    const bubble = Array.from(
      document.querySelectorAll('[data-valo-message-role="assistant"] div'),
    ).find((el) => el.textContent === 'assistant-bubble') as
      | HTMLElement
      | undefined;
    expect(bubble).toBeDefined();
    const style = bubble?.getAttribute('style') ?? '';
    expect(style).toContain('var(--valo-surface)');
    const cls = bubble?.className ?? '';
    expect(cls).toContain('border-[var(--valo-border)]');
    expect(cls).toContain('text-[var(--valo-text-primary)]');
  });

  it('整棵 MessageBubble 子树不再出现散落的 slate-/blue-/red-/yellow- 类名', () => {
    const { container } = renderBubble(
      baseMessage({ role: 'assistant', statusColor: 'error', source: 'llm' }),
    );
    const allClassNames = Array.from(
      container.querySelectorAll('[class]'),
    ).flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/));
    const offenders = allClassNames.filter(
      (cls) =>
        cls.startsWith('bg-slate') ||
        cls.startsWith('text-slate') ||
        cls.startsWith('border-slate') ||
        cls.startsWith('bg-blue') ||
        cls.startsWith('text-blue') ||
        cls.startsWith('border-blue') ||
        cls.startsWith('bg-red') ||
        cls.startsWith('text-red') ||
        cls.startsWith('bg-yellow') ||
        cls.startsWith('text-yellow'),
    );
    expect(offenders).toEqual([]);
  });

  // ---------- 子节点锚点 ----------

  it('chartTokens 存在时挂出 data-valo-message-charts="true" 容器', () => {
    renderBubble(
      baseMessage({
        role: 'assistant',
        chartTokens: ['sleep-duration' as never],
      }),
    );
    expect(
      document.querySelector('[data-valo-message-charts="true"]'),
    ).not.toBeNull();
  });

  it('memoryCandidates 存在时挂出 data-valo-message-memory="true" 容器', () => {
    renderBubble(
      baseMessage({
        role: 'assistant',
        memoryCandidates: [
          { id: 'mem-1', proposedConfirmationText: 'x', evidenceQuote: 'y' } as never,
        ],
      }),
    );
    expect(
      document.querySelector('[data-valo-message-memory="true"]'),
    ).not.toBeNull();
  });

  it('planDraft 响应只展示计划，不渲染普通文案、图表或记忆候选卡', () => {
    renderBubble(
      baseMessage({
        role: 'assistant',
        content: '这段睡眠质量分析不应显示',
        chartTokens: ['sleep-duration' as never],
        memoryCandidates: [
          { id: 'mem-plan', proposedConfirmationText: 'x', evidenceQuote: 'y' } as never,
        ],
        planDraft: {
          status: 'executable',
          draft: {
            draftId: 'draft-1',
            title: '7-Day Sleep Plan',
            summary: 'Plan summary',
            groups: [{ title: 'Day 1', tasks: [{ title: 'Set a wake time' }] }],
            createdAt: '2026-07-27T00:00:00.000Z',
          },
        },
      }),
    );

    expect(document.querySelector('[data-mock-plan-draft="true"]')).not.toBeNull();
    expect(document.querySelector('[data-valo-message-content="true"]')).toBeNull();
    expect(document.querySelector('[data-valo-message-charts="true"]')).toBeNull();
    expect(document.querySelector('[data-valo-message-memory="true"]')).toBeNull();
  });

  // ---------- 错误分支 ----------

  it('system 错误消息（以"发送失败"开头）使用 var(--valo-depleted) 边框/文字', () => {
    renderBubble(
      baseMessage({ role: 'system', content: '发送失败: network down' }),
    );
    const sysNode = document.querySelector(
      '[data-valo-message-role="system"]',
    ) as HTMLElement | null;
    expect(sysNode?.className ?? '').toContain('var(--valo-depleted)');
  });

  it('普通系统提示（非错误）使用 text-secondary 而非 depleted', () => {
    renderBubble(baseMessage({ role: 'system', content: '一般提示' }));
    const sysNode = document.querySelector(
      '[data-valo-message-role="system"]',
    ) as HTMLElement | null;
    expect(sysNode?.className ?? '').toContain('text-[var(--valo-text-secondary)]');
    expect(sysNode?.className ?? '').not.toContain('var(--valo-depleted)');
  });

  // ---------- finishReason fallback 提示 ----------
  // 设计变更：fallback 提示徽标已移除，不再渲染。

  it('meta.finishReason="fallback" 不再渲染 fallback 提示', () => {
    renderBubble(
      baseMessage({
        role: 'assistant',
        meta: {
          taskType: AgentTaskType.ADVISOR_CHAT,
          pageContext: {
            profileId: 'p1',
            page: 'homepage',
            timeframe: 'week',
          },
          finishReason: 'fallback',
        },
      }),
    );
    const tsNode = document.querySelector('[data-valo-message-timestamp]');
    // 时间戳节点不应再包含 Fallback 文案。
    expect(tsNode?.textContent ?? '').not.toContain('Fallback');
  });
});
