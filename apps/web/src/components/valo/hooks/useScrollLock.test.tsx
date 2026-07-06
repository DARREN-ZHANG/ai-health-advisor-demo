import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollLock } from './useScrollLock';

describe('useScrollLock', () => {
  afterEach(() => {
    document.body.removeAttribute('data-valo-scroll-lock-count');
    delete document.body.dataset.valoPrevOverflow;
    document.body.style.overflow = '';
  });

  it('locked=true 时设置 body.overflow=hidden', () => {
    document.body.style.overflow = '';
    renderHook(() => useScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('记录原始 overflow 并在卸载时还原', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('多个 lock 共存时引用计数，最后一个卸载才还原', () => {
    document.body.style.overflow = 'visible';
    const a = renderHook(() => useScrollLock(true));
    const b = renderHook(() => useScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
    a.unmount();
    // 仍有一个 lock 持有
    expect(document.body.style.overflow).toBe('hidden');
    b.unmount();
    expect(document.body.style.overflow).toBe('visible');
  });

  it('locked=false 不修改 overflow', () => {
    document.body.style.overflow = 'auto';
    renderHook(() => useScrollLock(false));
    expect(document.body.style.overflow).toBe('auto');
  });
});
