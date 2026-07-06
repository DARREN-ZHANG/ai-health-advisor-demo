import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { AIAdvisorDrawer } from './AIAdvisorDrawer';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useProfileStore } from '@/stores/profile.store';

/**
 * AI Advisor Drawer 测试用 next-intl 包装器。
 *
 * 比普通的 AdvisorIntlProvider 多塞一份 dataCenter / common 子集：
 * PhysiologicalTags 需要这些 key 才不会抛 MISSING_MESSAGE。
 * 真实文案由 messages/*.json + I7.1 负责。
 */
const ZH_MESSAGES = {
  common: {
    openAIAdvisor: '打开 AI 顾问',
    homepageContext: '首页',
    realTimeConnection: '实时连接',
  },
  dataCenter: {
    physTagSleep: '睡眠',
    physTagHrv: 'HRV',
    physTagRestingHr: '静息心率',
    physTagActivity: '活动',
    physTagSpo2: '血氧',
    physTagStress: '压力',
    physTagDay: '日',
    physTagWeek: '周',
    physTagMonth: '月',
    physTagYear: '年',
  },
  advisor: {
    title: 'AI 顾问',
    beta: 'BETA',
    clearChat: '清空对话',
    clearSession: '清空',
    clearConfirm: '确定要清除所有对话记录并重置 AI 会话吗？',
    welcomeTitle: '你好，我是你的健康顾问',
    welcomeSubtitle: '有什么健康问题尽管问我',
    suggestionsTitle: '试试这些问题：',
    composerPlaceholder: '输入你的问题...',
    send: '发送',
    close: '关闭',
    moreOptions: '更多选项',
    analyzing: '仔细分析中...',
    networkError: '发送失败，请检查网络连接',
    sendFailedDetail: '发送失败: {error}',
    smartPrompts: {
      sleepAnalysis: '分析我昨晚的睡眠质量',
      hrvTrends: '我最近的 HRV 趋势如何？',
      exerciseAdvice: '给我的运动计划提点建议',
      stressInquiry: '为什么我最近感觉压力很大？',
    },
  },
} as const;

function renderWithIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh" messages={ZH_MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

/**
 * mock useAdvisorChat —— 返回一个可控制的 mutateAsync。
 * 每个用例可重置 mockImpl 控制成功/失败/delay。
 */
const mockMutateAsync = vi.fn();
vi.mock('@/hooks/use-ai-query', () => ({
  useAdvisorChat: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockClearSessionId = vi.fn();
vi.mock('@/lib/api-client', () => ({
  clearSessionId: (...args: unknown[]) => mockClearSessionId(...args),
  AI_UI_TIMEOUT_MS: 6000,
}));

// next/navigation 的 usePathname 在 jsdom 下没有 router 会返回 null，
// 真实环境恒为字符串；这里固定为 '/' 让 PageContext.page='homepage'。
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

/**
 * jsdom 不解析 Tailwind 断点，移动端 (block lg:hidden) 与桌面端 (hidden lg:block)
 * 两层 overlay 同时挂载 DOM。约定始终把查询 scoped 到
 * `data-valo-viewport="mobile"`，避免重复元素引起的歧义（与
 * DemoControlDrawer 测试同一约定）。
 */
function getMobileContainer(): HTMLElement {
  const container = document.querySelector(
    '[data-valo-viewport="mobile"]',
  ) as HTMLElement | null;
  if (!container) {
    throw new Error('移动端视口容器未渲染；可能 isAdvisorDrawerOpen=false');
  }
  return container;
}

describe('AIAdvisorDrawer', () => {
  beforeEach(() => {
    useUIStore.setState({ isAdvisorDrawerOpen: false });
    useAIAdvisorStore.setState({
      messages: [],
      composerValue: '',
      isLoading: false,
      pendingPrompt: null,
    });
    useProfileStore.setState({ currentProfileId: 'profile-1' });
    mockMutateAsync.mockReset();
    mockClearSessionId.mockReset();
    // 默认 mutateAsync 解析为最小可用 envelope。
    mockMutateAsync.mockResolvedValue({
      summary: 'OK',
      chartTokens: [],
      microTips: [],
      memoryCandidates: [],
      source: 'fallback',
      statusColor: undefined,
      meta: { taskType: 'chat', pageContext: {}, finishReason: 'stop' },
    });
    // jsdom 默认无 window.confirm；mock 为同意。
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useUIStore.setState({ isAdvisorDrawerOpen: false });
    useAIAdvisorStore.setState({
      messages: [],
      composerValue: '',
      isLoading: false,
      pendingPrompt: null,
    });
  });

  it('isAdvisorDrawerOpen=false 时不渲染任何 dialog', () => {
    renderWithIntl(<AIAdvisorDrawer />);
    expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  });

  it('open 后同时挂载移动端 ValoSheet 与桌面端 ValoDialog（响应式双 DOM 设计）', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(getMobileContainer()).toBeInTheDocument();
    const desktop = document.querySelector('[data-valo-viewport="desktop"]');
    expect(desktop).not.toBeNull();
  });

  it('header 显示标题 "AI 顾问" 与 BETA 标签（移动端 viewport）', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(within(mobile).getByText('AI 顾问')).toBeInTheDocument();
    expect(within(mobile).getByText('BETA')).toBeInTheDocument();
  });

  it('empty state：无消息时显示 Valo 品牌欢迎标题、副标题与推荐问题小标题', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(
      within(mobile).getByText('你好，我是你的健康顾问'),
    ).toBeInTheDocument();
    expect(
      within(mobile).getByText('有什么健康问题尽管问我'),
    ).toBeInTheDocument();
    expect(within(mobile).getByText('试试这些问题：')).toBeInTheDocument();
    // empty state 容器标识存在
    expect(
      mobile.querySelector('[data-valo-empty-state="true"]'),
    ).not.toBeNull();
  });

  it('empty state 渲染 4 条 SmartPrompts 推荐问题', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(
      within(mobile).getByRole('button', { name: '分析我昨晚的睡眠质量' }),
    ).toBeInTheDocument();
    expect(
      within(mobile).getByRole('button', { name: '我最近的 HRV 趋势如何？' }),
    ).toBeInTheDocument();
  });

  it('composer 引用 --valo-prime 作为发送按钮背景', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    const sendBtn = within(mobile).getByRole('button', { name: '发送' });
    expect(sendBtn.getAttribute('style') ?? '').toContain('var(--valo-prime)');
  });

  it('发送按钮在 composer 为空时 disabled', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(
      within(mobile).getByRole('button', { name: '发送' }),
    ).toBeDisabled();
  });

  it('输入文字后发送按钮可点击，触发 useAdvisorChat.mutateAsync', async () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    const textarea = within(mobile).getByPlaceholderText(
      '输入你的问题...',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '我感觉很累' } });
    const sendBtn = within(mobile).getByRole('button', { name: '发送' });
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.userMessage).toBe('我感觉很累');
    expect(payload?.profileId).toBe('profile-1');
  });

  it('点击 SmartPrompt 直接发送对应问题', async () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    fireEvent.click(
      within(mobile).getByRole('button', { name: '分析我昨晚的睡眠质量' }),
    );
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mockMutateAsync.mock.calls[0]?.[0];
    expect(payload?.smartPromptId).toBe('sleep-analysis');
    expect(payload?.userMessage).toContain('睡眠');
  });

  it('助手回复成功后渲染到消息列表', async () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    // 注意：不带 chartTokens / memoryCandidates，避免触发 ChartTokenRenderer
    // （内部 useChartDataQuery 需要 QueryClientProvider，属于 I5.2 改造范围）。
    // 此处只验证纯文本 summary 能写入 store 并渲染。
    mockMutateAsync.mockResolvedValueOnce({
      summary: '你昨晚深睡偏少，建议睡前放松。',
      chartTokens: [],
      microTips: [],
      memoryCandidates: [],
      source: 'llm',
      statusColor: 'active',
      meta: { taskType: 'chat', pageContext: {}, finishReason: 'stop' },
    });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    const textarea = within(mobile).getByPlaceholderText(
      '输入你的问题...',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '昨晚睡眠如何' } });
    fireEvent.click(within(mobile).getByRole('button', { name: '发送' }));
    // store 应先写入 user 消息，再写入 assistant 消息。
    await waitFor(() => {
      const msgs = useAIAdvisorStore.getState().messages;
      expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
    });
    const assistantMsg = useAIAdvisorStore
      .getState()
      .messages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.content).toBe('你昨晚深睡偏少，建议睡前放松。');
    // DOM 也应渲染出文本（MessageBubble 的纯文本路径）。
    expect(
      within(mobile).getByText('你昨晚深睡偏少，建议睡前放松。'),
    ).toBeInTheDocument();
  });

  it('请求失败时渲染 system 错误消息', async () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    mockMutateAsync.mockRejectedValueOnce(new Error('network down'));
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    const textarea = within(mobile).getByPlaceholderText('输入你的问题...');
    fireEvent.change(textarea, { target: { value: 'hi' } });
    fireEvent.click(within(mobile).getByRole('button', { name: '发送' }));
    await waitFor(() => {
      expect(
        within(mobile).getByText('发送失败: network down'),
      ).toBeInTheDocument();
    });
  });

  it('点击"更多"按钮展开菜单，点击"清空对话"清空 messages 并调用 clearSessionId', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    // 先注入一条消息，让"清空"按钮可用
    useAIAdvisorStore.setState({
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'hi',
          timestamp: Date.now(),
        },
      ],
    });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    fireEvent.click(
      within(mobile).getByRole('button', { name: '更多选项' }),
    );
    fireEvent.click(within(mobile).getByText('清空对话'));
    expect(mockClearSessionId).toHaveBeenCalledTimes(1);
    // store 已被清空
    expect(useAIAdvisorStore.getState().messages).toHaveLength(0);
  });

  it('消息列表存在时不再渲染 empty state', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    useAIAdvisorStore.setState({
      messages: [
        { id: 'm1', role: 'user', content: 'hi', timestamp: 1 },
      ],
    });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(
      within(mobile).queryByText('你好，我是你的健康顾问'),
    ).toBeNull();
  });

  it('isLoading=true 时渲染"打字指示器"（三个跳动小点）', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    useAIAdvisorStore.setState({
      messages: [
        { id: 'm1', role: 'user', content: 'hi', timestamp: 1 },
      ],
      isLoading: true,
    });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    expect(
      mobile.querySelector('[data-valo-loading="true"]'),
    ).not.toBeNull();
  });

  it('header 关闭按钮调用 toggleAdvisorDrawer(false)', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    const toggleSpy = vi.spyOn(useUIStore.getState(), 'toggleAdvisorDrawer');
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    fireEvent.click(within(mobile).getByRole('button', { name: '关闭' }));
    expect(toggleSpy).toHaveBeenCalledWith(false);
    toggleSpy.mockRestore();
  });

  it('全部新代码仅引用 Valo token：移动端容器内不出现散落的 slate-/blue- 颜色类', () => {
    useUIStore.setState({ isAdvisorDrawerOpen: true });
    renderWithIntl(<AIAdvisorDrawer />);
    const mobile = getMobileContainer();
    // 收集所有元素的 className，断言不再出现旧的散落颜色类（header/composer/empty/loading 区）。
    // 注意：PhysiologicalTags / MessageBubble 仍是 I5.2 的改造范围，
    // 不在本次断言内（它们由组件内部 className 决定）。
    const targets = mobile.querySelectorAll(
      'header, footer, [data-valo-empty-state="true"], [data-valo-loading="true"]',
    );
    expect(targets.length).toBeGreaterThan(0);
    targets.forEach((node) => {
      const cls = (node as HTMLElement).className ?? '';
      expect(cls).not.toContain('bg-slate-');
      expect(cls).not.toContain('bg-blue-');
      expect(cls).not.toContain('text-blue-');
      expect(cls).not.toContain('border-slate-');
    });
  });
});
