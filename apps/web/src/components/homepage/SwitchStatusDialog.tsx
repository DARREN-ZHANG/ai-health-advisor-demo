'use client';

import { useId, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { ValoSheet } from '@/components/valo/ValoSheet';
import { ValoDialog } from '@/components/valo/ValoDialog';
import { HEALTH_STATE_METADATA, HEALTH_VISUAL_STATES } from '@/lib/valo-theme';
import type { HealthVisualState } from '@/lib/valo-theme';

/**
 * SwitchStatusDialog —— 健康状态切换弹窗。
 *
 * 设计要点（参见 docs/ui/valo/design-manifest.md）：
 * - 同时挂载移动端 `<ValoSheet>`（bottom-sheet）与桌面端 `<ValoDialog>`
 *   （centered, width=sm=420px），靠 Tailwind `block lg:hidden` / `hidden lg:block`
 *   切换可见性。与 DemoControlDrawer 同构。
 * - 内容是一个语义化的 `<form>` + `<fieldset>` + `<legend>`，四个原生
 *   `<input type="radio" name="health-state">`，键盘交互完全交给浏览器。
 * - 选择任意 radio 立即触发 `onSelect(state)`，由父组件应用 + 关闭弹窗；
 *   没有"提交"按钮——选择即提交。
 * - 颜色样本：小圆点用状态对应的 CSS 变量着色。
 * - 焦点管理 / 焦点返回 / Escape / scrim 关闭全部交给 ValoSheet/ValoDialog
 *   内部的 `useOverlayBehavior`，本组件不重复实现。
 *   `triggerRef` 显式传入以驱动焦点归还（移动端关闭后焦点回到圆环）。
 */
export interface SwitchStatusDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调（scrim / Escape / 关闭按钮触发） */
  onClose: () => void;
  /** 当前选中的状态（用于 radio checked） */
  current: HealthVisualState;
  /** 选择新状态：立即应用 + 关闭 */
  onSelect: (state: HealthVisualState) => void;
  /**
   * 用于焦点返回的触发器 ref（圆环按钮）。透传给 ValoSheet/ValoDialog →
   * useOverlayBehavior → useFocusReturn，确保移动端关闭弹窗后焦点回到圆环。
   */
  triggerRef?: RefObject<HTMLButtonElement | null>;
  /**
   * 弹窗根元素的 DOM id，供 HealthHero 的 aria-controls 关联。
   * 默认 'switch-status-dialog'，调用方一般无需改。
   */
  dialogId?: string;
}

export function SwitchStatusDialog({
  open,
  onClose,
  current,
  onSelect,
  triggerRef,
  dialogId = 'switch-status-dialog',
}: SwitchStatusDialogProps) {
  const t = useTranslations('health.switchStatus');
  // useId 给 fieldset/legend 内部锚点用，避免多实例 id 冲突
  const reactId = useId();
  const legendId = `${reactId}-legend`;

  const title = t('title');
  const legend = t('legend');

  // 共享内容：移动端 / 桌面端各渲染一份，避免 Tailwind 视口切换抖动
  const form = (
    <SwitchStatusForm
      legendId={legendId}
      legend={legend}
      current={current}
      onSelect={onSelect}
    />
  );

  return (
    <>
      {/* 移动端：bottom-sheet */}
      <div className="block lg:hidden" data-valo-viewport="mobile">
        <ValoSheet
          open={open}
          onClose={onClose}
          title={title}
          ariaLabel={title}
          triggerRef={triggerRef}
        >
          <div id={dialogId} className="px-5 pb-6 pt-3">
            {form}
          </div>
        </ValoSheet>
      </div>
      {/* 桌面端：centered dialog 420px */}
      <div className="hidden lg:block" data-valo-viewport="desktop">
        <ValoDialog
          open={open}
          onClose={onClose}
          title={title}
          width="sm"
          ariaLabel={title}
          triggerRef={triggerRef}
        >
          <div id={dialogId} className="px-6 pb-6 pt-3">
            {form}
          </div>
        </ValoDialog>
      </div>
    </>
  );
}

interface SwitchStatusFormProps {
  legendId: string;
  legend: string;
  current: HealthVisualState;
  onSelect: (state: HealthVisualState) => void;
}

function SwitchStatusForm({ legendId, legend, current, onSelect }: SwitchStatusFormProps) {
  const t = useTranslations('health.state');
  const reactId = useId();

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      // 阻止原生 form 提交；选择即提交的语义通过 radio onChange 体现
      aria-labelledby={legendId}
      data-valo-form="switch-status"
    >
      <fieldset className="border-0 p-0 m-0">
        {/* 视觉隐藏但仍可被 SR 朗读 */}
        <legend id={legendId} className="sr-only">
          {legend}
        </legend>
        <div className="flex flex-col gap-0.5">
          {HEALTH_VISUAL_STATES.map((state) => {
            const meta = HEALTH_STATE_METADATA[state];
            const id = `${reactId}-${state}`;
            const isChecked = current === state;
            return (
              <RadioOption
                key={state}
                id={id}
                state={state}
                stateLabel={t(state)}
                colorVar={meta.cssVar}
                checked={isChecked}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}

interface RadioOptionProps {
  id: string;
  state: HealthVisualState;
  stateLabel: string;
  colorVar: string;
  checked: boolean;
  onSelect: (state: HealthVisualState) => void;
}

function RadioOption({
  id,
  state,
  stateLabel,
  colorVar,
  checked,
  onSelect,
}: RadioOptionProps) {
  return (
    <label
      htmlFor={id}
      data-valo-option={state}
      data-valo-checked={checked ? 'true' : 'false'}
      className={
        'flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 py-1.5 cursor-pointer ' +
        'transition-colors select-none hover:bg-white/[0.04]'
      }
    >
      <input
        id={id}
        type="radio"
        name="health-state"
        value={state}
        checked={checked}
        onChange={() => onSelect(state)}
        // 让 SR 朗读"已选中 / 状态名"
        aria-label={stateLabel}
        data-valo-touch="true"
        className="sr-only"
      />
      {/* 主题色圆点：用状态对应的 CSS 变量着色 */}
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 rounded-full"
        style={{
          backgroundColor: colorVar,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${colorVar} 40%, transparent)`,
        }}
        data-valo-swatch={state}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-normal text-[var(--valo-text-primary)]">
        {stateLabel}
      </span>
      {/* 右侧 check 圆点：对标 AccountSwitcherSheet */}
      <span
        aria-hidden="true"
        className={
          'grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ' +
          (checked
            ? 'border-[var(--valo-active)] bg-[var(--valo-active)] shadow-[0_0_10px_color-mix(in_srgb,var(--valo-active)_60%,transparent)]'
            : 'border-white/35')
        }
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-black" fill="none">
            <path
              d="m3 6.1 1.8 1.8L9 3.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </label>
  );
}
