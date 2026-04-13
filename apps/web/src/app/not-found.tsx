'use client';

import Link from 'next/link';
import { Button, Container } from '@health-advisor/ui';

/** 404 页面 */
export default function NotFound() {
  return (
    <Container className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl font-bold text-slate-700 mb-4">404</div>
      <h1 className="text-xl font-semibold text-slate-200 mb-2">
        页面未找到
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-sm">
        你访问的页面不存在或已被移除。
      </p>
      <Link href="/">
        <Button variant="primary">返回首页</Button>
      </Link>
    </Container>
  );
}
