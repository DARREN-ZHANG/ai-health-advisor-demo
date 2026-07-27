'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useHomeTrendCardStore, selectHomeTrendCardDisplay } from '@/stores/home-trend-card.store';
import { HomeTrendCard } from './HomeTrendCard';

/**
 * HomeTrendCardSlot —— 连接 Profile + store，按 display 渲染 / 隐藏卡片。
 *
 * 视觉合同：
 * - display === 'hidden' 时不渲染任何 DOM（不占布局）。
 * - show / hide 使用 opacity + y 8px 渐入渐出。
 * - Sleep ↔ Activity 切换以 display 作为 motion key，外框高度不被动画影响。
 *
 * AnimatePresence initial=false：首次渲染不播放进入动画，
 * 避免刷新后已显示的卡片产生不必要位移。
 */
export interface HomeTrendCardSlotProps {
  profileId: string | undefined;
}

export function HomeTrendCardSlot({ profileId }: HomeTrendCardSlotProps) {
  const display = useHomeTrendCardStore((state) =>
    profileId ? selectHomeTrendCardDisplay(state, profileId) : 'hidden',
  );

  return (
    <AnimatePresence initial={false}>
      {display === 'hidden' ? null : (
        <motion.div
          key={display}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <HomeTrendCard display={display} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
