'use client';

import { useRef, useEffect, useState, useCallback, useId } from 'react';
import { usePathname } from 'next/navigation';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useAdvisorChat } from '@/hooks/use-ai-query';
import { clearSessionId, AI_UI_TIMEOUT_MS } from '@/lib/api-client';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import type { Message } from '@/stores/ai-advisor.store';
import { MessageBubble } from './MessageBubble';
import { SmartPrompts } from './SmartPrompts';
import type { SmartPromptOption } from './SmartPrompts';
import { PhysiologicalTags } from './PhysiologicalTags';
import type { PageContext, DataTab, Timeframe } from '@health-advisor/shared';
import {
  PaperAirplaneIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

/**
 * AI Advisor Drawer —— Valo 视觉的 AI 对话容器。
 *
 * 设计要点（I5.1）：
 * - 移动端（default → lg）：`ValoSheet variant="full-screen"`，全屏对话沉浸。
 * - 桌面端（lg+）：`ValoDialog variant="drawer" width={480}`，右侧面板。
 * - 两层 overlay 同时挂载 DOM，靠 Tailwind 的 `block lg:hidden` 与
 *   `hidden lg:block` 切换可见性。jsdom 不解析断点，故给每层加
 *   `data-valo-viewport` 标识，测试可基于该属性 scope 查询（与
 *   DemoControlDrawer 同样的约定）。
 * - 内容抽成 `<ChatContent>` 内部组件，避免双视口 JSX 重复。
 * - 全部颜色仅引用 `var(--valo-*)`；不再使用 slate-/blue- 散落类名。
 * - 行为完全保留：真实 Chat API、`pendingPrompt` 自动发送、loading、
 *   6 秒 UI 超时提示、清空会话。
 *
 * 与 I5.2 的边界：MessageBubble / PhysiologicalTags / ChartTokenRenderer /
 * MemoryCandidateCard 的内部视觉仍由 I5.2 统一改造，此处只把它们当作
 * 纯展示组件挂在新的容器里，不修改其实现。
 */
export function AIAdvisorDrawer() {
  const pathname = usePathname();
  const { isAdvisorDrawerOpen, toggleAdvisorDrawer } = useUIStore();
  const {
    messages,
    isLoading,
    composerValue,
    setComposerValue,
    addMessage,
    setLoading,
    clearMessages,
    pendingPrompt,
    setPendingPrompt,
  } = useAIAdvisorStore();
  const { currentProfileId } = useProfileStore();
  const { activeTab, timeframe } = useDataCenterStore();
  const t = useTranslations('advisor');

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTimeoutHint, setIsTimeoutHint] = useState(false);

  const { mutateAsync: sendChatRequest } = useAdvisorChat();

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // 处理 Active Sensing 触发的自动发送逻辑
  useEffect(() => {
    if (isAdvisorDrawerOpen && pendingPrompt && !isLoading && currentProfileId) {
      handleSendMessage(pendingPrompt);
      setPendingPrompt(null);
    }
    // handleSendMessage 通过 useCallback 稳定引用，可安全放入依赖。
  }, [isAdvisorDrawerOpen, pendingPrompt, isLoading, currentProfileId]);

  const handleClose = useCallback(() => toggleAdvisorDrawer(false), [toggleAdvisorDrawer]);

  const handleClearChat = useCallback(() => {
    if (window.confirm(t('clearConfirm'))) {
      clearMessages();
      clearSessionId();
    }
  }, [t, clearMessages]);

  const handleSendMessage = useCallback(
    async (content: string | SmartPromptOption) => {
      const isPromptOption = typeof content === 'object';
      const text = isPromptOption ? content.text : content || composerValue;
      const smartPromptId = isPromptOption ? content.id : undefined;
      if (!text.trim() || isLoading || !currentProfileId) return;

      // 1. 添加用户消息
      addMessage({ role: 'user', content: text });
      setComposerValue('');
      setLoading(true);
      setIsTimeoutHint(false);

      // 2. 构造上下文
      const pageContext: PageContext = {
        profileId: currentProfileId,
        page: pathname === '/' ? 'homepage' : pathname.replace('/', ''),
        dataTab: activeTab as DataTab,
        timeframe: timeframe as Timeframe,
      };

      // 3. 6 秒 UI 超时：只展示等待提示，不中断请求
      const uiTimeoutTimer = setTimeout(() => {
        setIsTimeoutHint(true);
      }, AI_UI_TIMEOUT_MS);

      try {
        // 4. 发送请求（网络超时已改为 30 秒兜底，给后端充足时间返回 fallback）
        const response = await sendChatRequest({
          profileId: currentProfileId,
          pageContext,
          userMessage: text,
          smartPromptId,
          visibleChartIds:
            pageContext.page === 'data-center' ? [activeTab] : undefined,
        });

        // 5. 添加助手回答（包括后端返回的 fallback 内容）
        addMessage({
          role: 'assistant',
          content: response.summary,
          chartTokens: response.chartTokens,
          microTips: response.microTips,
          memoryCandidates: response.memoryCandidates,
          source: response.source,
          statusColor: response.statusColor,
          meta: response.meta,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : t('networkError');
        addMessage({
          role: 'system',
          content: t('sendFailedDetail', { error: errorMessage }),
        });
      } finally {
        clearTimeout(uiTimeoutTimer);
        setLoading(false);
        setIsTimeoutHint(false);
      }
    },
    [
      composerValue,
      isLoading,
      currentProfileId,
      pathname,
      activeTab,
      timeframe,
      addMessage,
      setComposerValue,
      setLoading,
      sendChatRequest,
      t,
    ],
  );

  // 共享内容：移动端与桌面端共用一份 JSX，避免双视口实现漂移。
  const sharedContent = (
    <ChatContent
      scrollRef={scrollRef}
      messages={messages}
      isLoading={isLoading}
      isTimeoutHint={isTimeoutHint}
      composerValue={composerValue}
      setComposerValue={setComposerValue}
      onSendMessage={handleSendMessage}
      onClearChat={handleClearChat}
      isMenuOpen={isMenuOpen}
      setIsMenuOpen={setIsMenuOpen}
      onClose={handleClose}
    />
  );

  return (
    <>
      {/*
        移动端：全屏 Sheet，沉浸式对话。
        与桌面端 Drawer 同时挂载 DOM，靠 Tailwind `block lg:hidden` 切换可见性。
      */}
      <div className="block lg:hidden" data-valo-viewport="mobile">
        <ValoSheet
          open={isAdvisorDrawerOpen}
          onClose={handleClose}
          variant="full-screen"
          bodyScroll="native"
          ariaLabel={t('title')}
        >
          {sharedContent}
        </ValoSheet>
      </div>
      {/*
        桌面端：右侧 Drawer（480px），与首页内容并列。
      */}
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog
          open={isAdvisorDrawerOpen}
          onClose={handleClose}
          variant="drawer"
          width={480}
          bodyScroll="native"
          ariaLabel={t('title')}
        >
          {sharedContent}
        </ValoDialog>
      </div>
    </>
  );
}

interface ChatContentProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messages: Message[];
  isLoading: boolean;
  isTimeoutHint: boolean;
  composerValue: string;
  setComposerValue: (v: string) => void;
  onSendMessage: (content: string | SmartPromptOption) => void;
  onClearChat: () => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onClose: () => void;
}

/**
 * 对话主体：Header（标题 + 清空 + 关闭）/ PhysiologicalTags / 消息区 /
 * Loading / Empty State / Composer。无 overlay 行为，纯粹由外层
 * ValoSheet / ValoDialog 提供遮罩、焦点约束、滚动锁。
 */
function ChatContent({
  scrollRef,
  messages,
  isLoading,
  isTimeoutHint,
  composerValue,
  setComposerValue,
  onSendMessage,
  onClearChat,
  isMenuOpen,
  setIsMenuOpen,
  onClose,
}: ChatContentProps) {
  const t = useTranslations('advisor');
  const hasMessages = messages.length > 0;

  return (
    <div
      id="ai-advisor-drawer"
      className="contents"
      data-valo-chat-content="true"
    >
      <div className="flex flex-1 flex-col min-h-0">
        {/* ---------- Header ---------- */}
        <header
          className={
            'shrink-0 z-10 flex items-center justify-between gap-3 border-b ' +
            'border-[var(--valo-border)] bg-[var(--valo-surface)] px-4 py-3'
          }
        >
          <div className="flex items-center gap-2">
            <h2
              className="text-base font-semibold text-[var(--valo-text-primary)]"
              data-valo-serif="true"
              data-valo-advisor-title="true"
            >
              {t('title')}
            </h2>
            <span
              className={
                'inline-flex items-center rounded-full border border-[var(--valo-border)] ' +
                'bg-[var(--valo-canvas)] px-2 py-0.5 text-[10px] font-semibold uppercase ' +
                'text-[var(--valo-text-secondary)]'
              }
            >
              {t('beta')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <MoreMenu
              open={isMenuOpen}
              setOpen={setIsMenuOpen}
              onClear={onClearChat}
              disabled={!hasMessages}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              data-valo-touch="true"
              className={
                'rounded-full p-2 text-[var(--valo-text-secondary)] transition-colors ' +
                'hover:bg-[var(--valo-border)] hover:text-[var(--valo-text-primary)]'
              }
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* ---------- PhysiologicalTags ---------- */}
        <PhysiologicalTags />

        {/* ---------- 消息区 / Empty State ---------- */}
        <div
          ref={scrollRef}
          className={
            'flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar scroll-smooth'
          }
        >
          {!hasMessages ? (
            <>
              <EmptyState />
              <SmartPrompts onSelect={onSendMessage} />
            </>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
          {isLoading && <LoadingBubble isTimeoutHint={isTimeoutHint} />}
        </div>

        {/* ---------- Composer ---------- */}
        <footer
          className={
            'shrink-0 z-10 space-y-3 border-t border-[var(--valo-border)] ' +
            'bg-[var(--valo-surface)] px-4 py-3'
          }
        >
          <div className="relative flex items-end gap-2">
            <textarea
              rows={1}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              aria-label={t('composerLabel')}
              placeholder={t('composerPlaceholder')}
              data-valo-advisor-composer="true"
              className={
                'flex-1 min-h-[44px] max-h-32 resize-none rounded-full px-5 py-2.5 text-sm ' +
                'border border-[var(--valo-border)] bg-[var(--valo-canvas)] ' +
                'text-[var(--valo-text-primary)] placeholder:text-[var(--valo-text-secondary)] ' +
                'transition-all focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)]'
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => onSendMessage('')}
              disabled={!composerValue.trim() || isLoading}
              aria-label={t('send')}
              data-valo-touch="true"
              data-valo-advisor-send="true"
              className={
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-opacity ' +
                'disabled:opacity-40 hover:opacity-90 focus:outline-none ' +
                'focus-visible:shadow-[var(--valo-focus-ring)]'
              }
              style={{
                backgroundColor: 'var(--valo-prime)',
                color: 'var(--valo-canvas)',
              }}
            >
              <PaperAirplaneIcon className="w-5 h-5 -rotate-45" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Empty State —— Valo 品牌空态：环形霓虹主视觉 + 欢迎文案。
 *
 * 主视觉用纯 SVG 实现（绿→蓝→紫→粉渐变环 + drop-shadow 发光晕染），
 * 中央镂空保留页面背景，与 design-manifest.md AI Chat 画板对齐。
 * 推荐问题（SmartPrompts）由 ChatContent 在空态时一并渲染。
 */
function EmptyState() {
  const t = useTranslations('advisor');
  // 用 useId 生成唯一 id，避免 mobile + desktop 双 overlay 同时挂载时
  // linearGradient id 重复导致渐变引用错乱（React 18 稳定 API）。
  const ringGradientId = useId();
  return (
    <div
      className="flex flex-col items-center justify-center gap-6 px-6 py-10 text-center"
      data-valo-empty-state="true"
    >
      {/* 环形霓虹主视觉：纯 SVG + 渐变 + drop-shadow */}
      <svg
        viewBox="0 0 200 200"
        width={200}
        height={200}
        aria-hidden="true"
        data-valo-empty-hero="true"
        className="drop-shadow-[0_0_24px_rgba(167,139,250,0.45)]"
      >
        <defs>
          <linearGradient id={ringGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--valo-active)" />
            <stop offset="35%" stopColor="var(--valo-accent-cool)" />
            <stop offset="70%" stopColor="var(--valo-prime)" />
            <stop offset="100%" stopColor="var(--valo-accent-warm)" />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="none"
          stroke={`url(#${ringGradientId})`}
          strokeWidth="6"
        />
        <circle
          cx="100"
          cy="100"
          r="64"
          fill="none"
          stroke={`url(#${ringGradientId})`}
          strokeWidth="2"
          opacity="0.6"
        />
      </svg>
      <div className="space-y-1">
        <p
          className="text-base font-semibold text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('welcomeTitle')}
        </p>
        <p className="text-sm text-[var(--valo-text-secondary)]">
          {t('welcomeSubtitle')}
        </p>
      </div>
      <p className="mt-2 self-start text-xs font-semibold uppercase tracking-wide text-[var(--valo-text-secondary)]">
        {t('suggestionsTitle')}
      </p>
    </div>
  );
}

/**
 * Loading Bubble —— 等待 AI 回复时的占位"打字指示器"。
 *
 * 复用旧版的三个跳动小点；颜色统一改为 `--valo-text-secondary`，
 * 超时提示文字使用 `--valo-sluggish`（橙色光谱，与 active/prime 区分）。
 */
function LoadingBubble({ isTimeoutHint }: { isTimeoutHint: boolean }) {
  const t = useTranslations('advisor');
  return (
    <div className="flex justify-start my-3 px-1" data-valo-loading="true" data-valo-advisor-loading="true">
      <div
        className={
          'flex items-center gap-1 rounded-2xl rounded-tl-none border px-4 py-2 ' +
          'border-[var(--valo-border)] bg-[var(--valo-canvas)]'
        }
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--valo-text-secondary)]"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
        {isTimeoutHint && (
          <span
            className="ml-2 text-[10px]"
            style={{ color: 'var(--valo-sluggish)' }}
          >
            {t('analyzing')}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * More Menu —— 顶部"更多"按钮，承载清空对话动作。
 * 用 Valo token 重写：surface 背景、border 边框、depleted 文字色。
 */
function MoreMenu({
  open,
  setOpen,
  onClear,
  disabled,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('advisor');
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t('moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-valo-touch="true"
        className={
          'rounded-full p-2 text-[var(--valo-text-secondary)] transition-colors ' +
          'hover:bg-[var(--valo-border)] hover:text-[var(--valo-text-primary)]'
        }
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className={
                'absolute right-0 mt-1 w-44 overflow-hidden rounded-xl border z-20 py-1.5 ' +
                'border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
                'shadow-[var(--valo-shadow-elevated)]'
              }
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                disabled={disabled}
                data-valo-advisor-clear="true"
                className={
                  'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold ' +
                  'text-[var(--valo-depleted)] transition-colors hover:bg-[var(--valo-border)] ' +
                  'disabled:pointer-events-none disabled:opacity-30'
                }
              >
                <TrashIcon className="h-4 w-4" />
                {t('clearChat')}
              </button>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
