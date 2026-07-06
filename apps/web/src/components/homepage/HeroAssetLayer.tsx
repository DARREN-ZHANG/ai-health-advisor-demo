'use client';

import { heroAssetManifest } from '@/lib/hero-asset-manifest';
import type { HealthVisualState } from '@/lib/valo-theme';

/**
 * HeroAssetLayer —— 渲染 Hero 顶部装饰位图。
 *
 * 设计契约（参见 docs/ui/valo/design-manifest.md 第 45 行）：
 * - Hero 装饰图层允许位图；状态标题/圆环交互仍由 HTML 承载。
 * - 装饰层为非交互元素，pointer-events: none，不阻挡圆环点击。
 * - 资产 URL 在 manifest 中固化，状态切换读取对应条目。
 *
 * @visible-by 父容器（HealthHero 的 `<section>`），以 absolute 填满父级。
 */
export interface HeroAssetLayerProps {
  /** 当前生效的视觉状态（决定取 manifest 的哪个条目） */
  state: HealthVisualState;
  /** 追加 className（用于父组件覆盖尺寸约束） */
  className?: string;
}

export function HeroAssetLayer({ state, className = '' }: HeroAssetLayerProps) {
  const entry = heroAssetManifest[state];
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className}`}
      data-valo-hero-asset={state}
    >
      <img
        src={entry.src}
        alt=""
        aria-hidden="true"
        width={entry.width}
        height={entry.height}
        loading="eager"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React 18.3 类型未声明 fetchPriority
        fetchPriority={'high' as any}
        decoding="async"
        draggable={false}
        className="w-full h-full object-cover select-none"
      />
    </div>
  );
}
