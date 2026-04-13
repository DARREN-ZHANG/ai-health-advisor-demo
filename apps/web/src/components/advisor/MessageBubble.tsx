'use client';

import { m } from 'framer-motion';
import type { Message } from '@/stores/ai-advisor.store';

import { ChartTokenRenderer } from './ChartTokenRenderer';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded">
          {message.content}
        </span>
      </div>
    );
  }

  const sourceLabel = message.source === 'fallback'
    ? 'Fallback'
    : message.source === 'llm'
      ? 'LLM'
      : message.source;

  const statusClassName = message.statusColor === 'error'
    ? 'text-red-400 bg-red-400/10'
    : message.statusColor === 'warning'
      ? 'text-yellow-400 bg-yellow-400/10'
      : 'text-emerald-400 bg-emerald-400/10';

  return (
    <m.div
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 10 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}
    >
      <div className={`max-w-[85%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-none'
              : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
          }`}
        >
          {message.content}
        </div>
        
        {isAssistant && message.chartTokens && message.chartTokens.length > 0 && (
          <div className="w-full mt-2 flex flex-col gap-2">
            {message.chartTokens.map((token, idx) => (
              <ChartTokenRenderer key={idx} tokenId={token} />
            ))}
          </div>
        )}

        <span className="text-[10px] text-slate-500 mt-1 px-1 flex items-center gap-2">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {message.statusColor && (
            <span className={`rounded px-1.5 py-0.5 uppercase tracking-wider ${statusClassName}`}>
              {message.statusColor}
            </span>
          )}
          {message.source && (
            <span className="rounded px-1.5 py-0.5 text-slate-400 bg-slate-800/70 uppercase tracking-wider">
              {sourceLabel}
            </span>
          )}
          {message.meta?.finishReason === 'fallback' && (
            <span className="text-yellow-500/60 flex items-center gap-1">
              <span className="w-1 h-1 bg-yellow-500 rounded-full" />
              Fallback
            </span>
          )}
        </span>
      </div>
    </m.div>
  );
}
