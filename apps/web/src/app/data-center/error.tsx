'use client';

import { Button, Container } from '@health-advisor/ui';

interface DataCenterErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Data Center 路由错误边界 */
export default function DataCenterError({ error, reset }: DataCenterErrorProps) {
  const isNetworkError =
    error.message?.includes('fetch') ||
    error.message?.includes('network') ||
    error.message?.includes('Failed to fetch');

  return (
    <Container className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">&#x1F4CA;</div>
      <h1 className="text-xl font-semibold text-slate-200 mb-2">
        {isNetworkError ? '数据加载失败' : '数据中心出错'}
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-sm">
        {isNetworkError
          ? '无法获取健康数据，请检查网络后重试。'
          : error.message || '加载图表时发生错误，请稍后再试。'}
      </p>
      <Button variant="primary" onClick={reset}>
        重试
      </Button>
    </Container>
  );
}
