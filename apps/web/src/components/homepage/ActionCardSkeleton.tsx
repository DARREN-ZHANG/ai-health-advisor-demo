/**
 * ActionCardSkeleton —— 流式期间 ActionCard 的占位骨架。
 *
 * 视觉对齐 ActionCard 的尺寸与形状（min-h-[244px] 横滚卡片），
 * 配色沿用设计系统 var(--valo-*) token，与 BriefTimeline 的 skeleton
 * 风格一致（animate-pulse + bg-[var(--valo-border)]）。
 *
 * 作为 <li> 渲染，与 ActionCard 的元素层级保持一致，
 * 保证横滚列表结构不因占位/真实卡片切换而抖动。
 */
export function ActionCardSkeleton() {
  return (
    <li
      aria-hidden="true"
      className="flex min-h-[244px] shrink-0 animate-pulse flex-col justify-between rounded-lg bg-[var(--valo-surface)] px-3 py-6 shadow-[var(--valo-shadow-card)]"
      data-valo-action-tip-card=""
      style={{ flexBasis: 'calc((100% - 12px) / 1.8)' }}
    >
      <div className="space-y-4 text-center">
        {/* emoji 占位 */}
        <div className="mx-auto h-8 w-8 rounded-full bg-[var(--valo-border)]" />
        {/* 标题占位 */}
        <div className="mx-auto h-4 w-24 rounded bg-[var(--valo-border)]" />
        {/* 描述占位（两行） */}
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-[var(--valo-border)]" />
          <div className="mx-auto h-3 w-2/3 rounded bg-[var(--valo-border)]" />
        </div>
      </div>
      {/* 按钮区占位 */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <div className="h-8 w-12 rounded-full bg-[var(--valo-border)]" />
        <div className="h-8 w-14 rounded-md bg-[var(--valo-border)]" />
      </div>
    </li>
  );
}
