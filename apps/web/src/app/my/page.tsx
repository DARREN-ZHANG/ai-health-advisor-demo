'use client';

import { MyScreen } from '@/components/settings/MyScreen';

/**
 * /my 路由页面。
 *
 * 仅挂载 MyScreen；底部导航（home / data-center / my）由 I6.2 全局接入。
 */
export default function MyPage() {
  return <MyScreen />;
}
