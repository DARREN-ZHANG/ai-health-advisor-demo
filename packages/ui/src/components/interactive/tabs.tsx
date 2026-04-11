import type { HTMLAttributes } from 'react';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** 选项卡列表 */
  items: readonly TabItem[];
  /** 当前激活的选项卡 id */
  activeId: string;
  /** 选项卡切换回调 */
  onSelect: (id: string) => void;
}

/** 选项卡组件 */
export function Tabs({ items, activeId, onSelect, className = '', ...rest }: TabsProps) {
  return (
    <div className={`flex gap-1 ${className}`} role="tablist" {...rest}>
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
