/**
 * motion.ts —— Valo overlay 组件共享的 framer-motion 变体。
 *
 * 这些变体在 ValoSheet 与 ValoDialog 之间复用，避免重复定义。
 * 仅导出真正被多处使用的变体；某个组件独有的过渡仍保留在组件内部。
 *
 * 命名约定：`MOTION_<ROLE>`，例如 `MOTION_SCRIM`（遮罩）、
 * `MOTION_BOTTOM_SHEET`（底部 Sheet）等。
 */

/** 遮罩淡入淡出。所有 overlay 都用同一份，保证视觉一致。 */
export const MOTION_SCRIM = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: 'tween' as const, duration: 0.2 },
};

/** 底部 Sheet：从屏幕底部向上滑入。 */
export const MOTION_BOTTOM_SHEET = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'tween' as const, duration: 0.25, ease: 'easeOut' as const },
};

/** 全屏覆盖：透明度淡入。 */
export const MOTION_FULL_SCREEN = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' as const },
};

/** 居中弹窗：轻微缩放 + 上移淡入。 */
export const MOTION_CENTERED = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 8 },
  transition: { type: 'tween' as const, duration: 0.2, ease: 'easeOut' as const },
};

/** 右侧 Drawer：从屏幕右侧滑入。 */
export const MOTION_DRAWER = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: { type: 'tween' as const, duration: 0.25, ease: 'easeOut' as const },
};
