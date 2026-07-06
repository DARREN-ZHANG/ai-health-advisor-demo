'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
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
 * 切换状态时浏览器需要重新下载/解码位图，期间会有一帧到几十毫秒的空白。
 * 这里通过 `loaded` 状态把 img 初始 opacity 设为 0，在 onLoad 触发后再
 * 过渡到 opacity-100，避免硬切白闪。
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
  // state 切换时 src 变化，需要重新等待 onLoad 才能渐显新位图；
  // 用 effect 在 state 变化时把 loaded 重置回 false，配合 onLoad 切到 true。
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [state]);

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className}`.trim()}
      data-valo-hero-asset={state}
    >
      <img
        src={entry.src}
        alt=""
        aria-hidden="true"
        width={entry.width}
        height={entry.height}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        draggable={false}
        onLoad={(e: SyntheticEvent<HTMLImageElement>) => {
          // 防御：仅在 img 真正解码完成且仍是当前 state 对应的 src 时切到 opacity-100。
          // 避免 state 已经切走、旧 onLoad 才回调时把过期图打成可见。
          if (e.currentTarget.src.endsWith(entry.src)) {
            setLoaded(true);
          }
        }}
        className={
          'w-full h-full object-cover select-none transition-opacity duration-500 ' +
          (loaded ? 'opacity-100' : 'opacity-0')
        }
      />
    </div>
  );
}
