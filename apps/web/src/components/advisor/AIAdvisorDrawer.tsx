'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Drawer, Sheet, IconButton } from '@health-advisor/ui';
import { useUIStore } from '@/stores/ui.store';
import { useAIAdvisorStore } from '@/stores/ai-advisor.store';
import { useProfileStore } from '@/stores/profile.store';
import { useDataCenterStore } from '@/stores/data-center.store';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useAdvisorChat } from '@/hooks/use-ai-query';
import { clearSessionId, AI_UI_TIMEOUT_MS } from '@/lib/api-client';
import { MessageBubble } from './MessageBubble';
import { SmartPrompts } from './SmartPrompts';
import type { SmartPromptOption } from './SmartPrompts';
import { PhysiologicalTags } from './PhysiologicalTags';
import type { PageContext, DataTab, Timeframe } from '@health-advisor/shared';

/** 响应式断点，与架构文档对齐：Mobile < 768, Tablet 768-1279, Desktop >= 1280 */
const DESKTOP_QUERY = '(min-width: 1280px)';
const TABLET_QUERY = '(min-width: 768px)';

export function AIAdvisorDrawer() {
  const pathname = usePathname();
  const { isAdvisorDrawerOpen, toggleAdvisorDrawer, showToast } = useUIStore();
  const { messages, isLoading, composerValue, setComposerValue, addMessage, setLoading, clearMessages } = useAIAdvisorStore();
  const { currentProfileId } = useProfileStore();
  const { activeTab, timeframe } = useDataCenterStore();
  
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { mutateAsync: sendChatRequest } = useAdvisorChat();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleClose = () => toggleAdvisorDrawer(false);

  const handleClearChat = () => {
    if (window.confirm('确定要清除所有对话记录并重置 AI 会话吗？')) {
      clearMessages();
      clearSessionId();
    }
  };

  const Title = (
    <div className="flex items-center justify-between w-full pr-8">
      <span className="font-bold flex items-center gap-2">
        AI Health Advisor 
        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded uppercase">BETA</span>
      </span>
      {messages.length > 0 && (
        <button 
          onClick={handleClearChat}
          className="text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase tracking-wider font-bold"
        >
          Clear Chat
        </button>
      )}
    </div>
  );

  const [isTimeoutHint, setIsTimeoutHint] = useState(false);

  const handleSendMessage = useCallback(async (content: string | SmartPromptOption) => {
    const isPromptOption = typeof content === 'object';
    const text = isPromptOption ? content.text : (content || composerValue);
    const smartPromptId = isPromptOption ? content.id : undefined;
    if (!text.trim() || isLoading || !currentProfileId) return;

    // 1. 添加用户消息
    addMessage({
      role: 'user',
      content: text,
    });
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
        visibleChartIds: pageContext.page === 'data-center' ? [activeTab] : undefined,
      });

      // 5. 添加助手回答（包括后端返回的 fallback 内容）
      addMessage({
        role: 'assistant',
        content: response.summary,
        chartTokens: response.chartTokens,
        microTips: response.microTips,
        source: response.source,
        statusColor: response.statusColor,
        meta: response.meta,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发送失败，请检查网络连接';
      addMessage({
        role: 'system',
        content: `发送失败: ${errorMessage}`,
      });
    } finally {
      clearTimeout(uiTimeoutTimer);
      setLoading(false);
      setIsTimeoutHint(false);
    }
  }, [composerValue, isLoading, currentProfileId, pathname, activeTab, timeframe, addMessage, setComposerValue, setLoading, sendChatRequest]);

  const Content = (
    <div className="flex flex-col h-full bg-slate-950">
      {/* 顶部状态标签 */}
      <PhysiologicalTags />

      {/* 消息区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-4 opacity-50">
            <span className="text-4xl">✨</span>
            <div>
              <p className="text-sm font-medium text-slate-100">我是你的 AI 健康顾问</p>
              <p className="text-xs text-slate-400 mt-1">你可以问我关于运动、睡眠或任何生理指标的问题</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        {isLoading && (
          <div className="flex justify-start my-3">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-none px-4 py-2 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              {isTimeoutHint && (
                <span className="text-[10px] text-yellow-500/80 ml-2">响应较慢，正在等待...</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-3">
        {/* 智能提示 */}
        <SmartPrompts onSelect={handleSendMessage} />

        <div className="relative flex items-end gap-2">
            <textarea
              rows={1}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              placeholder="问我点什么..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none min-h-[44px] max-h-32"
              onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage('');
              }
            }}
          />
          <IconButton
            onClick={() => handleSendMessage('')}
            disabled={!composerValue.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl h-11 w-11 transition-all shadow-lg shadow-blue-500/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </IconButton>
        </div>
      </div>
    </div>
  );

  // 桌面端（>= 1280px）：右侧 Drawer
  if (isDesktop) {
    return (
      <Drawer
        open={isAdvisorDrawerOpen}
        onClose={handleClose}
        title={Title}
        className="w-[400px] max-w-[90vw]"
      >
        <div className="absolute inset-0 top-[52px]">{Content}</div>
      </Drawer>
    );
  }

  // 平板端（768-1279px）：宽 Sheet
  if (isTablet) {
    return (
      <Sheet
        open={isAdvisorDrawerOpen}
        onClose={handleClose}
        title={Title}
        className="h-[85vh] max-w-lg mx-auto"
      >
        <div className="absolute inset-0 top-[60px]">{Content}</div>
      </Sheet>
    );
  }

  // 移动端（< 768px）：底部 Sheet
  return (
    <Sheet
      open={isAdvisorDrawerOpen}
      onClose={handleClose}
      title={Title}
      className="h-[80vh]"
    >
      <div className="absolute inset-0 top-[60px]">{Content}</div>
    </Sheet>
  );
}
