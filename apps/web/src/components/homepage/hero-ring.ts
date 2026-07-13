import type { HealthVisualState } from '@/lib/valo-theme';

/** Hero 圆环与紧凑型加载环共用的状态渐变。 */
export const HERO_RING_STOPS: Record<HealthVisualState, readonly string[]> = {
  'prime-readiness': [
    'var(--valo-active)',
    'var(--valo-accent-cool)',
    'var(--valo-prime)',
    'var(--valo-accent-warm)',
  ],
  'active-recovery': [
    'var(--valo-active)',
    'var(--valo-accent-cool)',
    'var(--valo-prime)',
    'var(--valo-active)',
  ],
  'metabolic-sluggish': [
    'var(--valo-sluggish)',
    'var(--valo-accent-warm)',
    'var(--valo-prime)',
    'var(--valo-sluggish)',
  ],
  'glycogen-depleted': [
    'var(--valo-depleted)',
    'var(--valo-sluggish)',
    'var(--valo-prime)',
    'var(--valo-depleted)',
  ],
};

/** 对齐 Hero loading 状态在 60fps 下每帧 0.024rad 的旋转周期。 */
export const HERO_LOADING_ROTATION_DURATION_SECONDS = (Math.PI * 2) / (0.024 * 60);
