/**
 * FutureTimelineBlockSkeleton —— 流式期间 FutureTimelineBlock 的占位骨架。
 *
 * 视觉对齐 FutureTimelineBlock 的结构（左侧圆点 + 时间标题 + 段落），
 * 配色沿用设计系统 var(--valo-*) token，与 BriefTimeline 的 skeleton
 * 风格一致（animate-pulse + bg-[var(--valo-border)]）。
 *
 * 作为 <section> 渲染，与 FutureTimelineBlock 的元素层级一致，
 * 保证流式占位与真实卡片切换时无布局抖动。
 */
export function FutureTimelineBlockSkeleton() {
  return (
    <section
      aria-hidden="true"
      className="relative animate-pulse pl-8"
      data-valo-future-tip=""
    >
      {/* 左侧圆点占位（位置与真实圆点对齐） */}
      <span
        className="absolute left-0 top-1 h-4 w-4 rounded-full bg-[var(--valo-border)]"
      />
      {/* 时间标题占位 */}
      <div className="h-4 w-28 rounded bg-[var(--valo-border)]" />
      {/* 段落占位（三行） */}
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--valo-border)]" />
        <div className="h-3 w-full rounded bg-[var(--valo-border)]" />
        <div className="h-3 w-3/4 rounded bg-[var(--valo-border)]" />
      </div>
    </section>
  );
}
