import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ReflectionSection } from './ReflectionSection';
import { DataCenterIntlProvider } from './intl-test-helper';
import type { AgentResponseEnvelope } from '@health-advisor/shared';

/**
 * ReflectionSection 测试套件。
 *
 * 通过 vi.mock 替换 `useViewSummary` hook，覆盖：
 * - loading：骨架 + aria-busy
 * - error / empty：低调占位文案
 * - loaded：summary + microTips
 * - 仅 summary（无 microTips）
 *
 * 该组件自身不发起真实网络请求；hook 行为由 use-ai-query 负责。
 */

const mockUseViewSummary = vi.fn();

vi.mock('@/hooks/use-ai-query', () => ({
  useViewSummary: (...args: unknown[]) => mockUseViewSummary(...args),
}));

function renderWithIntl(node: React.ReactNode) {
  return render(<DataCenterIntlProvider>{node}</DataCenterIntlProvider>);
}

function makeQueryResult(
  overrides: Partial<UseQueryResult<AgentResponseEnvelope | null>> = {},
): UseQueryResult<AgentResponseEnvelope | null> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isLoadingError: false,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    refetch: vi.fn(),
    status: 'pending',
    fetchStatus: 'idle',
    promise: Promise.resolve(null),
    ...overrides,
  } as UseQueryResult<AgentResponseEnvelope | null>;
}

/** 构造最小可用 AgentResponseEnvelope，避免每个用例重复 meta / source 等必填字段 */
function makeEnvelope(
  overrides: Partial<AgentResponseEnvelope>,
): AgentResponseEnvelope {
  return {
    summary: '',
    source: 'llm',
    statusColor: 'neutral' as AgentResponseEnvelope['statusColor'],
    chartTokens: [],
    meta: {
      taskType: 'view-summary' as AgentResponseEnvelope['meta']['taskType'],
      pageContext: {
        profileId: 'profile-1',
        page: 'data-center',
      } as AgentResponseEnvelope['meta']['pageContext'],
      finishReason: 'complete',
    },
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  profileId: 'profile-1',
  pageContext: {
    page: 'data-center' as const,
    tab: 'sleep' as const,
    timeframe: 'week',
  },
};

describe('ReflectionSection', () => {
  beforeEach(() => {
    mockUseViewSummary.mockReset();
  });
  afterEach(() => cleanup());

  it('挂载根节点并打上 data-valo-trends-reflection 钩子', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    const root = document.querySelector('[data-valo-trends-reflection]');
    expect(root).not.toBeNull();
  });

  it('使用 useViewSummary 派发请求（profileId + pageContext）', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(mockUseViewSummary).toHaveBeenCalledWith(
      'profile-1',
      'sleep',
      'week',
    );
  });

  it('渲染 Reflection 标题', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('洞察')).toBeInTheDocument();
  });

  it('loading 时渲染骨架占位并标记 aria-busy', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({ isLoading: true, isFetching: true }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    const busy = document.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    // 骨架不渲染 summary / empty 文案
    expect(screen.queryByText('暂无洞察')).not.toBeInTheDocument();
  });

  it('仅 isFetching=true 也标记 aria-busy', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({ isLoading: false, isFetching: true }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('isError=true 渲染空态文案', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({ isError: true }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('暂无洞察')).toBeInTheDocument();
  });

  it('数据为空（无 summary）渲染空态文案', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({ summary: '', microTips: [] }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('暂无洞察')).toBeInTheDocument();
  });

  it('summary 为纯空白时也判定为空态', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({ summary: '   \n  ', microTips: [] }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('暂无洞察')).toBeInTheDocument();
  });

  it('loaded 时渲染 summary 文本', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({ summary: '昨晚深睡比例提升，恢复良好。', microTips: [] }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('昨晚深睡比例提升，恢复良好。')).toBeInTheDocument();
    expect(screen.queryByText('暂无洞察')).not.toBeInTheDocument();
  });

  it('loaded 且带 microTips 时渲染提示文本', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({
          summary: '概览',
          microTips: ['多喝水', '适当拉伸'],
        }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.getByText('多喝水')).toBeInTheDocument();
    expect(screen.getByText('适当拉伸')).toBeInTheDocument();
  });

  it('microTips 为空数组时不渲染提示文本', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({ summary: '概览', microTips: [] }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.queryByText('多喝水')).not.toBeInTheDocument();
  });

  it('microTips 项渲染为非交互 li（非按钮）', () => {
    mockUseViewSummary.mockReturnValue(
      makeQueryResult({
        data: makeEnvelope({ summary: 'x', microTips: ['提示一', '提示二'] }),
        isSuccess: true,
      }),
    );
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('className 透传到 section 根节点', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(
      <ReflectionSection {...DEFAULT_PROPS} className="mt-8 extra-class" />,
    );
    const root = document.querySelector(
      '[data-valo-trends-reflection]',
    ) as HTMLElement;
    expect(root.className).toContain('mt-8');
    expect(root.className).toContain('extra-class');
    expect(root.className).not.toContain('rounded-2xl');
  });

  it('profileId 为 undefined 时 hook 仍被调用（调用方控制 enabled）', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(
      <ReflectionSection {...DEFAULT_PROPS} profileId={undefined} />,
    );
    expect(mockUseViewSummary).toHaveBeenCalledWith(
      undefined,
      'sleep',
      'week',
    );
  });

  it('渲染为 section 语义元素', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    const root = document.querySelector(
      '[data-valo-trends-reflection]',
    ) as HTMLElement;
    expect(root.tagName).toBe('SECTION');
  });

  it('aria-label 指向 Reflection 标题', () => {
    mockUseViewSummary.mockReturnValue(makeQueryResult());
    renderWithIntl(<ReflectionSection {...DEFAULT_PROPS} />);
    const root = document.querySelector(
      '[data-valo-trends-reflection]',
    ) as HTMLElement;
    expect(root.getAttribute('aria-label')).toBe('洞察');
  });
});
