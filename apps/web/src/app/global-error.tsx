'use client';

/** 全局错误边界 — 捕获 layout 级别的致命错误（替换整个页面） */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-200">
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
          <div className="text-5xl mb-4">&#x1F6A8;</div>
          <h1 className="text-xl font-semibold text-slate-200 mb-2">
            应用发生了严重错误
          </h1>
          <p className="text-slate-400 text-sm mb-8 max-w-sm">
            {error.message || '请刷新页面或联系管理员。'}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </body>
    </html>
  );
}
