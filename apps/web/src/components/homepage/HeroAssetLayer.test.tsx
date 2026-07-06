import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
});
