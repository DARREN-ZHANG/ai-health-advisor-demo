import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { HeroAssetLayer } from './HeroAssetLayer';
import { heroAssetManifest } from '@/lib/hero-asset-manifest';
import { HEALTH_VISUAL_STATES } from '@/lib/valo-theme';

describe('HeroAssetLayer', () => {
  afterEach(() => cleanup());

  it('四态穷举：渲染对应 <img> src', () => {
    for (const state of HEALTH_VISUAL_STATES) {
      cleanup();
      const { container } = render(<HeroAssetLayer state={state} />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe(heroAssetManifest[state].src);
    }
  });

  it('img 设置 intrinsic width/height（避免 CLS）', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('804');
    expect(img?.getAttribute('height')).toBe('732');
  });

  it('img 标记 aria-hidden 与 draggable=false', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('draggable')).toBe('false');
  });

  it('img 加载优先级为 eager + high fetchPriority', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('容器绝对定位 + pointer-events: none', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('absolute');
    expect(wrapper.className).toContain('pointer-events-none');
  });

  it('不出现 hex 字面量（仅 token 引用）', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const wrapper = container.firstElementChild as HTMLElement;
    const style = wrapper.getAttribute('style') ?? '';
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('初始 img 为 opacity-0，onLoad 后渐显为 opacity-100', () => {
    const { container } = render(<HeroAssetLayer state="prime-readiness" />);
    const img = container.querySelector('img') as HTMLImageElement;
    // 初始未加载完：保持透明，避免硬切白闪
    expect(img.className).toContain('opacity-0');
    expect(img.className).toContain('transition-opacity');
    // 模拟浏览器解码完成触发 onLoad
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
    expect(img.className).not.toContain('opacity-0');
  });

  it('切换 state 时 loaded 重置，img 回到 opacity-0 直到新位图 onLoad', () => {
    const { container, rerender } = render(<HeroAssetLayer state="prime-readiness" />);
    const imgBefore = container.querySelector('img') as HTMLImageElement;
    fireEvent.load(imgBefore);
    expect(imgBefore.className).toContain('opacity-100');

    // 切到 active-recovery：state 变 → effect 重置 loaded → img 重新 opacity-0
    rerender(<HeroAssetLayer state="active-recovery" />);
    const imgAfter = container.querySelector('img') as HTMLImageElement;
    expect(imgAfter.className).toContain('opacity-0');
    expect(imgAfter.className).not.toContain('opacity-100');
    // 新位图 onLoad 完成后才渐显
    fireEvent.load(imgAfter);
    expect(imgAfter.className).toContain('opacity-100');
  });
});
