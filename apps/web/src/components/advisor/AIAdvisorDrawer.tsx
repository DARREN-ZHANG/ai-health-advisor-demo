'use client';

import Image from 'next/image';
import { useRef, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { m, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useAdvisorChat } from '@/hooks/use-ai-query';
import { clearSessionId, AI_UI_TIMEOUT_MS } from '@/lib/api-client';
import { applyAdvisorUiDirectives } from '@/lib/advisor-ui-directives';
import {
  selectHomeTrendCardDisplay,
  selectSleepHomepageOfferState,
  useHomeTrendCardStore,
} from '@/stores/home-trend-card.store';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import type { Message } from '@/stores/ai-advisor.store';
import { MessageBubble } from './MessageBubble';
import { SmartPrompts } from './SmartPrompts';
import type { SmartPromptOption } from './SmartPrompts';
import type {
  PageContext,
  DataTab,
  Timeframe,
  AdvisorProactiveAction,
  AdvisorProactiveInteraction,
} from '@health-advisor/shared';
import {
  PaperAirplaneIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  XMarkIcon,
  MicrophoneIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

interface ProactiveSubmission {
  text: string;
  clientInteraction: AdvisorProactiveInteraction;
  proactiveMessageId: string;
}

type AdvisorSubmission = string | SmartPromptOption | ProactiveSubmission;

/**
 * AI Advisor Drawer —— Valo 视觉的 AI 对话容器。
 *
 * 设计要点（I5.1）：
 * - 移动端（default → lg）：`ValoSheet variant="full-screen"`，全屏对话沉浸。
 * - 桌面端（lg+）：`ValoDialog variant="drawer" width={402}`，右侧面板。
 * - 两层 overlay 同时挂载 DOM，靠 Tailwind 的 `block lg:hidden` 与
 *   `hidden lg:block` 切换可见性。jsdom 不解析断点，故给每层加
 *   `data-valo-viewport` 标识，测试可基于该属性 scope 查询（与
 *   DemoControlDrawer 同样的约定）。
 * - 内容抽成 `<ChatContent>` 内部组件，避免双视口 JSX 重复。
 * - 全部颜色仅引用 `var(--valo-*)`；不再使用 slate-/blue- 散落类名。
 * - 行为完全保留：真实 Chat API、`pendingPrompt` 自动发送、loading、
 *   6 秒 UI 超时提示、清空会话。
 *
 * 与 I5.2 的边界：MessageBubble / ChartTokenRenderer / MemoryCandidateCard
 * 的内部视觉仍由 I5.2 统一改造，此处只改抽屉壳层，不修改其实现。
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
    markProactivePromptResponded,
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

  // 抽屉打开时隐藏页面级滚动条：抽屉自身已有内部滚动（消息列表 no-scrollbar），
  // 此时背景页面的 html 滚动条是多余的视觉干扰，隐藏它避免出现两条滚动条。
  // 仍保留 html 的滚动能力（no-scrollbar 只隐藏视觉条），关闭后恢复。
  useEffect(() => {
    const root = document.documentElement;
    if (isAdvisorDrawerOpen) {
      root.classList.add('no-scrollbar');
      return () => root.classList.remove('no-scrollbar');
    }
  }, [isAdvisorDrawerOpen]);

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
    async (content: AdvisorSubmission) => {
      const isObject = typeof content === 'object';
      const isProactiveSubmission = isObject && 'clientInteraction' in content;
      const isPromptOption = isObject && !isProactiveSubmission;
      const text = isObject ? content.text : content || composerValue;
      const smartPromptId = isPromptOption ? content.id : undefined;
      const clientInteraction = isProactiveSubmission
        ? content.clientInteraction
        : undefined;
      if (!text.trim() || isLoading || !currentProfileId) return;

      // 1. 添加用户消息
      addMessage({ role: 'user', content: text });
      setComposerValue('');
      setLoading(true);
      setIsTimeoutHint(false);

      // 2. 构造上下文
      const requestProfileId = currentProfileId;
      const homepageTrendCard = selectHomeTrendCardDisplay(
        useHomeTrendCardStore.getState(),
        requestProfileId,
      );
      const sleepHomepageOffer = selectSleepHomepageOfferState(
        useHomeTrendCardStore.getState(),
        requestProfileId,
      );
      const pageContext: PageContext = {
        profileId: requestProfileId,
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
          profileId: requestProfileId,
          pageContext,
          userMessage: text,
          smartPromptId,
          visibleChartIds: pageContext.page === 'data-center' ? [activeTab] : undefined,
          uiContext: { homepageTrendCard, sleepHomepageOffer },
          clientInteraction,
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
          // 仅在 envelope 通过审核且 route 层注入了 draftId 时挂载 planDraft。
          // store.addMessage 内部会把历史消息中的 executable draft 自动转为 revoked。
          planDraft:
            response.planDraft && response.meta.finishReason === 'complete'
              ? { status: 'executable', draft: response.planDraft }
              : undefined,
          proactivePrompt: response.proactivePrompt
            ? { status: 'pending', prompt: response.proactivePrompt }
            : undefined,
        });

        // 6. 应用首页 Trends Brief UI 指令（仅当 finishReason=complete 且 profile 匹配）。
        // 用发送时的 requestProfileId，避免等待期间切换 Profile 后污染当前视图。
        applyAdvisorUiDirectives(response, requestProfileId);

        // 只有服务端成功接受 typed interaction 后才锁定原提议；网络失败时按钮保留可重试。
        if (isProactiveSubmission) {
          markProactivePromptResponded(
            content.proactiveMessageId,
            content.clientInteraction.decision,
          );
          if (
            content.clientInteraction.proposal === 'homepage.sleep.show' &&
            content.clientInteraction.decision === 'decline'
          ) {
            useHomeTrendCardStore
              .getState()
              .setSleepOfferState(requestProfileId, 'declined');
          }
        }
        if (response.proactivePrompt?.kind === 'homepage.sleep.show') {
          useHomeTrendCardStore
            .getState()
            .setSleepOfferState(requestProfileId, 'offered');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : t('networkError');
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
      markProactivePromptResponded,
      t,
    ],
  );

  const handleProactiveAction = useCallback(
    (messageId: string, action: AdvisorProactiveAction) => {
      void handleSendMessage({
        text: action.userMessage,
        clientInteraction: action.interaction,
        proactiveMessageId: messageId,
      });
    },
    [handleSendMessage],
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
      onProactiveAction={handleProactiveAction}
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
          className="bg-[var(--valo-chat-frame)]"
        >
          {sharedContent}
        </ValoSheet>
      </div>
      {/*
        桌面端：右侧 Drawer（402px），与设计稿 frame 宽度一致。
      */}
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog
          open={isAdvisorDrawerOpen}
          onClose={handleClose}
          variant="drawer"
          width={402}
          bodyScroll="native"
          ariaLabel={t('title')}
          className="border-l-0 bg-[var(--valo-chat-frame)] shadow-none"
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
  onProactiveAction: (messageId: string, action: AdvisorProactiveAction) => void;
}

/**
 * 对话主体：对齐 Figma AI Chat frame。
 * 空态与输入区严格按设计稿尺寸与层次重排；真实消息流与发送行为保持不变。
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
  onProactiveAction,
}: ChatContentProps) {
  const t = useTranslations('advisor');
  const hasMessages = messages.length > 0;
  const sendDisabled = !composerValue.trim() || isLoading;

  return (
    <div id="ai-advisor-drawer" className="h-full" data-valo-chat-content="true">
      <div
        className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--valo-chat-frame)]"
        data-valo-chat-shell="true"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(167, 139, 250, 0.24), transparent 62%)',
          }}
        />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col pt-24">
          <div
            className="flex min-h-0 flex-1 flex-col rounded-t-[24px] bg-[var(--valo-chat-panel)]"
            data-valo-chat-panel="true"
          >
            <div className="relative flex min-h-0 flex-1 flex-col">
              <button
                type="button"
                onClick={onClose}
                aria-label={t('close')}
                className="absolute left-6 top-6 z-20 grid h-8 w-8 place-items-center rounded-full transition-opacity hover:opacity-85 focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)]"
                style={{
                  backgroundColor: 'var(--valo-chat-close-bg)',
                  color: 'var(--valo-chat-close-icon)',
                }}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>

              {hasMessages ? (
                <div className="absolute right-6 top-6 z-20">
                  <MoreMenu
                    open={isMenuOpen}
                    setOpen={setIsMenuOpen}
                    onClear={onClearChat}
                    disabled={!hasMessages}
                  />
                </div>
              ) : null}

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-24 no-scrollbar scroll-smooth"
              >
                {!hasMessages ? (
                  <div className="flex min-h-full flex-col justify-center">
                    <EmptyState />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        interactionDisabled={isLoading}
                        onProactiveAction={onProactiveAction}
                      />
                    ))}
                    {isLoading ? <LoadingBubble isTimeoutHint={isTimeoutHint} /> : null}
                  </div>
                )}
              </div>

              <footer className="shrink-0 px-5 pb-6 pt-4">
                {!hasMessages ? (
                  <div
                    data-valo-smart-prompts-anchor="true"
                    style={{ marginBottom: '45px' }}
                  >
                    <SmartPrompts onSelect={onSendMessage} />
                  </div>
                ) : null}
                <div
                  data-valo-composer-shell="true"
                  className="flex h-12 items-center rounded-full px-4"
                  style={{ backgroundColor: 'var(--valo-chat-composer)' }}
                >
                  <span
                    aria-hidden="true"
                    className="mr-3 inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--valo-text-primary)]"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </span>
                  <textarea
                    rows={1}
                    value={composerValue}
                    onChange={(e) => setComposerValue(e.target.value)}
                    aria-label={t('composerLabel')}
                    placeholder={t('composerPlaceholder')}
                    data-valo-advisor-composer="true"
                    className="min-h-[18px] flex-1 resize-none bg-transparent text-[14px] leading-[18px] font-medium text-[var(--valo-text-primary)] placeholder:text-[var(--valo-text-secondary)] focus:outline-none no-scrollbar"
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
                    disabled={sendDisabled}
                    aria-label={t('send')}
                    data-valo-advisor-send="true"
                    className="ml-3 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[var(--valo-text-primary)] transition-opacity hover:opacity-85 focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)] disabled:opacity-60"
                  >
                    {sendDisabled ? (
                      <MicrophoneIcon className="h-5 w-5" />
                    ) : (
                      <PaperAirplaneIcon className="h-5 w-5 -rotate-45" />
                    )}
                  </button>
                </div>
              </footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty State —— Figma AI Chat 空态：48px orb + 24px 衬线标题。
 */
function EmptyState() {
  const t = useTranslations('advisor');
  return (
    <div
      className="flex flex-col items-center gap-4 px-6 text-center"
      data-valo-empty-state="true"
    >
      <Image
        src="/valo/images/chat-entrance.png"
        alt=""
        width={48}
        height={48}
        priority
        aria-hidden="true"
        data-valo-empty-hero="true"
      />
      <div className="space-y-0.5">
        <p
          className="text-[24px] leading-[33px] text-[var(--valo-text-primary)]"
          data-valo-serif="true"
        >
          {t('welcomeTitle')}
        </p>
      </div>
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
    <div
      className="flex justify-start my-3 px-1"
      data-valo-loading="true"
      data-valo-advisor-loading="true"
    >
      <div
        className={
          'flex items-center gap-1 rounded-[20px] rounded-tl-none px-4 py-2 ' +
          'bg-[var(--valo-chat-chip)]'
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
          <span className="ml-2 text-[10px]" style={{ color: 'var(--valo-sluggish)' }}>
            {t('analyzing')}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * More Menu —— 仅在已有消息时显示的右上角菜单。
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
        className="grid h-8 w-8 place-items-center rounded-full transition-opacity hover:opacity-85 focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)]"
        style={{
          backgroundColor: 'var(--valo-chat-close-bg)',
          color: 'var(--valo-chat-close-icon)',
        }}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className={
                'absolute right-0 mt-1 w-44 overflow-hidden rounded-xl border z-20 py-1.5 ' +
                'border-[var(--valo-border)] bg-[var(--valo-chat-panel)] ' +
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
