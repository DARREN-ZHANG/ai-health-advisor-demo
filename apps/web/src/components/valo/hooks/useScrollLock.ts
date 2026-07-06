'use client';

import { useEffect } from 'react';

/**
 * useScrollLock —— 在打开时锁定 document.body 滚动。
 *
 * 行为契约：
 * - 当 `locked` 为 true 时，把 `document.body` 的 `overflow` 设为 `hidden`，
 *   并记录原始值，关闭时还原。
 * - 多个 overlay 同时存在时使用引用计数：第一次 lock 写入隐藏，最后一个
 *   unlock 才还原，避免提前解锁。
 * - 仅在浏览器环境生效，SSR 安全。
 *
 * 注意：jsdom 不会真正阻止滚动，本 hook 的真实效果需在浏览器中验证。
 */
const LOCK_COUNT_ATTR = 'data-valo-scroll-lock-count';

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body) return;

    if (!locked) return;

    // 引用计数自增
    const next = incrementCount(body);
    if (next === 1) {
      // 第一次 lock：保存原始 overflow 并隐藏
      body.dataset.valoPrevOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    }

    return () => {
      if (typeof document === 'undefined') return;
      const remaining = decrementCount(body);
      if (remaining <= 0) {
        body.style.overflow = body.dataset.valoPrevOverflow ?? '';
        delete body.dataset.valoPrevOverflow;
        body.removeAttribute(LOCK_COUNT_ATTR);
      }
    };
  }, [locked]);
}

function incrementCount(body: HTMLElement): number {
  const current = Number(body.getAttribute(LOCK_COUNT_ATTR) ?? '0');
  const next = current + 1;
  body.setAttribute(LOCK_COUNT_ATTR, String(next));
  return next;
}

function decrementCount(body: HTMLElement): number {
  const current = Number(body.getAttribute(LOCK_COUNT_ATTR) ?? '0');
  const next = Math.max(0, current - 1);
  if (next === 0) {
    body.removeAttribute(LOCK_COUNT_ATTR);
  } else {
    body.setAttribute(LOCK_COUNT_ATTR, String(next));
  }
  return next;
}
