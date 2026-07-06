'use client';

import { useTranslations } from 'next-intl';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { DemoControlTrigger } from '@/components/demo-control/DemoControlTrigger';
import { useUIStore } from '@/stores/ui.store';

/**
 * HomeHeader —— 首页顶部栏。
 *
 * 布局（参见 docs/ui/valo/design-manifest.md）：
 * - 左：Avatar（profile switcher 入口）。I3.1 阶段 Avatar 是占位按钮：
 *   点击只弹"即将上线"toast，不打开 Switch Status 也不打开 Profile Switch。
 *   I6.1 会按设计接入真正的 Profile Switch 弹窗。
 * - 紧邻 Avatar：Demo Control 触发器（仅 God Mode 启用时渲染）。
 *   I2.2/I2.3 之前 trigger 临时挂在 layout.tsx 浮层；本任务把它迁回
 *   HomeHeader，符合设计稿"入口在 Avatar 旁"的位置约定。
 *
 * Hero（HealthHero）由父页面渲染，放在 HomeHeader 下方；本组件不直接
 * 持有 Hero，便于 I3.2 在 Hero 与下方内容之间插入更多模块。
 */
export interface HomeHeaderProps {
  /** Avatar 点击的扩展点；I6.1 接入 Profile Switch 后会替换默认行为 */
  onAvatarClick?: () => void;
}

export function HomeHeader({ onAvatarClick }: HomeHeaderProps) {
  const t = useTranslations('homepage');
  const { showToast } = useUIStore();

  const handleAvatarClick = () => {
    if (onAvatarClick) {
      onAvatarClick();
      return;
    }
    // 占位行为：明确告知"Profile Switch 即将上线"，不打开任何弹窗。
    // 刻意不耦合 SwitchStatusDialog——Switch Status 唯一入口是 Hero 圆环。
    showToast(t('avatarPlaceholder'), 'info');
  };

  return (
    <header
      className="flex items-center gap-2 px-4 pt-4"
      data-valo-header="home"
    >
      <AvatarButton onClick={handleAvatarClick} label={t('avatarPlaceholder')} />
      {/* Demo Control 触发器自管可见性（God Mode 关时返回 null） */}
      <DemoControlTrigger />
    </header>
  );
}

interface AvatarButtonProps {
  onClick: () => void;
  label: string;
}

function AvatarButton({ onClick, label }: AvatarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      // 占位阶段不真正展开任何弹窗，expanded 恒为 false
      aria-expanded={false}
      data-valo-touch="true"
      data-valo-avatar="true"
      className={
        'inline-flex h-10 w-10 items-center justify-center rounded-full ' +
        'border border-[var(--valo-border)] bg-[var(--valo-surface)] ' +
        'text-[var(--valo-text-secondary)] transition-colors ' +
        'hover:text-[var(--valo-text-primary)] hover:bg-[var(--valo-border)]'
      }
    >
      <UserCircleIcon className="h-6 w-6" />
    </button>
  );
}
