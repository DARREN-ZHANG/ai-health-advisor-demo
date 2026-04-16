import { type ReactNode, type HTMLAttributes } from 'react';
import { Drawer } from './drawer';

export interface SheetProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 面板标题 */
  title?: ReactNode;
  /** 子元素 */
  children: ReactNode;
}

/** 
 * 底部弹出面板（Bottom Sheet）组件 
 * @deprecated 请优先使用 Drawer 组件并设置 side="bottom"
 */
export function Sheet({
  open,
  onClose,
  title,
  className = '',
  children,
  ...rest
}: SheetProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      side="bottom"
      size="md"
      className={className}
      {...rest}
    >
      {children}
    </Drawer>
  );
}
