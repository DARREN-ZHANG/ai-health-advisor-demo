'use client';

import { forwardRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HEALTH_STATE_METADATA } from '@/lib/valo-theme';
import type { HealthVisualState } from '@/lib/valo-theme';
import { HeroGlowCanvas } from './HeroGlowCanvas';
import { ThinkingText } from './ThinkingText';

/**
 * HealthHero —— 首页 Hero 区，承载"四态健康状态环"。
 *
 * 设计要点（参见 docs/ui/valo/design-manifest.md）：
 * - 整个圆环就是一个 `<button type="button">`，是 SwitchStatusDialog 的唯一
 *   入口；不存在"装饰圆 + 透明 overlay"的二层结构。
 * - 圆环 box-shadow 仍由状态对应的 CSS 变量驱动（`--valo-prime` 等），
 *   位图装饰由 HeroAssetLayer 按 state 消费；不出现 hex 字面量。
 * - 圆环 box-shadow 在状态切换时走 transition 过渡；位图通过 onLoad 渐显
 *   避免硬切（详见 HeroAssetLayer 的 loaded 状态）。
 * - 圆心展示状态名（i18n 翻译），可访问名通过 `aria-label` 提供。
 * - 移动端 / 桌面端均满足 40px 最小触达（`data-valo-touch="true"`）。
 *
 * 状态来源：父组件从 `useHealthStatusStore(selectActiveVisualState)` 选取后
 * 通过 `state` prop 传入；本组件不直接订阅 store，便于测试与复用。
 */
export interface HealthHeroProps {
  /** 当前生效的视觉状态（由父组件从 store 选取） */
  state: HealthVisualState;
  /** LLM 正在生成简报；临时展示最佳准备配色的思考态 */
  isLoading?: boolean;
  /** 当前简报由 fallback 引擎生成；圆心显示 Offline */
  isOffline?: boolean;
  /** 圆环点击：打开 Switch Status 弹窗 */
  onOpenSwitchStatus: () => void;
  /** 圆环是否处于 expanded 态（弹窗已打开），驱动 aria-expanded */
  isSwitchStatusOpen?: boolean;
  /**
   * SwitchStatusDialog 的 DOM id，用于 `aria-controls` 关联。
   * 调用方应保证弹窗根元素挂上同 id（移动端 / 桌面端任一即可）。
   */
  switchStatusDialogId?: string;
  /** 可选：在 Hero 内部追加的子内容（如时间段标题）。不强求。 */
  children?: ReactNode;
}

/**
 * 用 `forwardRef` 暴露圆环 button 的 ref，让父组件可以把焦点还给圆环
 * （虽然 ValoSheet/ValoDialog 内部的 useOverlayBehavior 已经处理焦点返回，
 * 但显式暴露 ref 让集成测试与未来扩展更稳健）。
 */
export const HealthHero = forwardRef<HTMLButtonElement, HealthHeroProps>(
  function HealthHero(
    {
      state,
      isLoading = false,
      isOffline = false,
      onOpenSwitchStatus,
      isSwitchStatusOpen = false,
      switchStatusDialogId,
      children,
    },
    ref,
  ) {
    const t = useTranslations('health');
    const visualState = isLoading ? 'prime-readiness' : state;
    const meta = HEALTH_STATE_METADATA[visualState];
    // fallback 优先显示 Offline；loading 时圆心由 <ThinkingText /> 接管。
    const stateLabel = isOffline
      ? 'Offline'
      : isLoading
        ? null
        : t(`state.${state}` as const);
    const ringLabel = t('switchStatus.ringLabel');

    return (
      <section
        className="relative -mx-4 -mt-[128px] flex min-h-[488px] flex-col items-center justify-center overflow-hidden px-4 pb-10 pt-[208px] md:mx-0 md:rounded-none"
        data-valo-hero="true"
        data-valo-state={visualState}
        data-valo-loading={isLoading ? 'true' : undefined}
      >
        <HeroGlowCanvas state={visualState} isLoading={isLoading} />

        {/*
         * 整个圆环就是 button 本身：
         * - 外层圆形 button 通过 padding 给出尺寸，box-shadow 形成"环 + 内圈光晕"。
         *   视觉位图改由 HeroAssetLayer 承载，button 不再写 backgroundImage 渐变。
         * - 内层 div 是圆心文字与可访问名锚点，pointer-events:none 防止
         *   文字层吞点击事件。
         * - aria-label 由 i18n 提供，确保双语 SR 朗读正确。
         * - box-shadow 用 var(--valo-state-color) 内嵌变量：父级通过 style
         *   注入该状态对应颜色，圆环高光随之改变。
         * - relative z-10 确保圆环位于 HeroAssetLayer 之上可被点击。
         */}
        <button
          ref={ref}
          type="button"
          onClick={onOpenSwitchStatus}
          aria-haspopup="dialog"
          aria-expanded={isSwitchStatusOpen}
          aria-busy={isLoading}
          {...(switchStatusDialogId ? { 'aria-controls': switchStatusDialogId } : {})}
          aria-label={ringLabel}
          data-valo-touch="true"
          data-valo-ring="true"
          className={
            'relative z-10 inline-flex h-[210px] w-[210px] items-center justify-center rounded-full ' +
            'bg-transparent ' +
            'outline-none transition-all duration-500 ease-out ' +
            'focus-visible:shadow-[var(--valo-focus-ring)] ' +
            'hover:scale-[1.02] active:scale-[0.99]'
          }
          style={{
            // 状态色作为内嵌变量，供 box-shadow 共用
            // @ts-expect-error -- CSS custom property in style object
            '--valo-state-color': meta.cssVar,
            boxShadow: `0 0 54px 10px color-mix(in srgb, ${meta.cssVar} 12%, transparent)`,
          }}
        >
          {/* 圆心状态名：纯文字，pointer-events:none 不阻断点击 */}
          <span
            className="pointer-events-none flex flex-col items-center gap-1 select-none"
            data-valo-state-label="true"
          >
            <span
              className="max-w-[8ch] text-center text-[28px] leading-[1.05] text-[var(--valo-text-primary)]"
              style={{ fontFamily: 'var(--valo-font-serif)' }}
            >
              {stateLabel ?? <ThinkingText />}
            </span>
          </span>
        </button>
        {children ? (
          <div className="relative z-10 text-center" data-valo-hero-children="true">
            {children}
          </div>
        ) : null}
      </section>
    );
  },
);
