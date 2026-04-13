/** 根级路由加载态（Server Component — 不使用客户端依赖） */
export default function RootLoading() {
  return (
    <div className="py-6 px-4 space-y-8 max-w-3xl mx-auto">
      {/* 标题骨架 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-md bg-slate-700" />
          <div className="h-4 w-32 animate-pulse rounded-md bg-slate-700" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-md bg-slate-700" />
      </div>

      {/* 晨报骨架 */}
      <div className="space-y-4">
        <div className="h-5 w-24 animate-pulse rounded-md bg-slate-700" />
        <div className="h-32 w-full animate-pulse rounded-xl bg-slate-700" />
      </div>

      {/* 微贴士骨架 */}
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded-md bg-slate-700" />
        <div className="flex gap-2">
          <div className="h-8 w-20 animate-pulse rounded-full bg-slate-700" />
          <div className="h-8 w-16 animate-pulse rounded-full bg-slate-700" />
          <div className="h-8 w-24 animate-pulse rounded-full bg-slate-700" />
        </div>
      </div>

      {/* 趋势骨架 */}
      <div className="space-y-4">
        <div className="h-5 w-24 animate-pulse rounded-md bg-slate-700" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-700" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-700" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-700" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-700" />
        </div>
      </div>
    </div>
  );
}
