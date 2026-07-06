'use client';

import { useUIStore } from '@/stores/ui.store';
import type { Toast } from '@/stores/ui.store';
import { m, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';

/**
 * Toast 类型 → Valo 语义 token 映射。
 * 错误/成功/警告/信息分别绑到 depleted/active/sluggish/prime，
 * 与 design-manifest.md 颜色 token 表对齐。
 */
const TYPE_TOKEN: Readonly<Record<Toast['type'], string>> = {
  info: 'var(--valo-prime)',
  success: 'var(--valo-active)',
  warning: 'var(--valo-sluggish)',
  error: 'var(--valo-depleted)',
};

export function ToastContainer() {
  const t = useTranslations('common');
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 w-full max-w-sm px-4">
      <AnimatePresence>
        {toasts.map((toast) => {
          const token = TYPE_TOKEN[toast.type];
          // error 必须立即打断 SR；其余 type 走 polite 等空闲再朗读（W3C/MDN 建议）
          const ariaLive = toast.type === 'error' ? 'assertive' : 'polite';
          return (
            <m.div
              key={toast.id}
              role="alert"
              aria-live={ariaLive}
              aria-atomic="true"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => removeToast(toast.id)}
              data-valo-toast={toast.type}
              className={
                'cursor-pointer flex items-center gap-3 pl-4 pr-3 py-3 rounded-2xl border ' +
                'text-white text-sm font-medium transition-transform hover:scale-[1.02]'
              }
              style={{
                backgroundColor: `color-mix(in srgb, ${token} 18%, var(--valo-surface))`,
                borderColor: `color-mix(in srgb, ${token} 45%, transparent)`,
                // 左侧 4px 强调色 bar + 提升阴影（合并到一个 boxShadow，避免被 className 覆盖）
                boxShadow: `inset 4px 0 0 0 ${token}, var(--valo-shadow-elevated)`,
              }}
            >
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                aria-label={t('close')}
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="opacity-70 hover:opacity-100 shrink-0"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
