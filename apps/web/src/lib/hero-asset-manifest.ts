/**
 * Hero 装饰资产清单（TypeScript 模块，避免运行时 JSON 解析失败）。
 *
 * 资产由设计稿导出 2× PNG 至 apps/web/public/valo/hero/。
 * 路径以 `/` 开头，由 Next.js 当静态资源服务。
 *
 * 严格对应 valo-theme.ts 的 HealthVisualState 四态：Readonly<Record>
 * 强制四态齐全，缺条目会在编译期报错。
 */
import type { HealthVisualState } from './valo-theme';

export interface HeroAssetEntry {
  /** 静态资源 URL（Next.js public 目录） */
  readonly src: string;
  /** 原始像素宽度（intrinsic size，避免 CLS） */
  readonly width: number;
  /** 原始像素高度 */
  readonly height: number;
}

export type HeroAssetManifest = Readonly<
  Record<HealthVisualState, HeroAssetEntry>
>;

export const heroAssetManifest: HeroAssetManifest = {
  'prime-readiness': {
    src: '/valo/hero/prime-readiness.png',
    width: 804,
    height: 732,
  },
  'active-recovery': {
    src: '/valo/hero/active-recovery.png',
    width: 804,
    height: 732,
  },
  'metabolic-sluggish': {
    src: '/valo/hero/metabolic-sluggish.png',
    width: 804,
    height: 732,
  },
  'glycogen-depleted': {
    src: '/valo/hero/glycogen-depleted.png',
    width: 804,
    height: 732,
  },
};
