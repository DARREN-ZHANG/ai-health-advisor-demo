/** Data Center 路由加载态（Server Component） */
export default function DataCenterLoading() {
  return (
    <div className="py-6 px-4 space-y-6 max-w-3xl mx-auto">
      {/* 标题骨架 */}
      <div className="space-y-1">
        <div className="h-7 w-32 animate-pulse rounded-md bg-slate-700" />
        <div className="h-4 w-48 animate-pulse rounded-md bg-slate-700" />
      </div>

      {/* 控件骨架 */}
      <div className="flex gap-3">
        <div className="h-8 w-20 animate-pulse rounded-full bg-slate-700" />
        <div className="h-8 w-20 animate-pulse rounded-full bg-slate-700" />
        <div className="h-8 w-20 animate-pulse rounded-full bg-slate-700" />
        <div className="h-8 w-8 ml-auto animate-pulse rounded-md bg-slate-700" />
      </div>

      {/* 图表骨架 */}
      <div className="space-y-4">
        <div className="h-5 w-24 animate-pulse rounded-md bg-slate-700" />
        <div className="h-72 w-full animate-pulse rounded-xl bg-slate-700" />
      </div>
    </div>
  );
}
