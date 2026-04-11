# Wave 1 Re-review

Review date: 2026-04-11

Scope: Re-review current repository status against Wave 1 in `docs/full-project-task-backlog.md` after follow-up fixes.

## Summary

| 状态 | 数量 | 任务 |
| --- | ---: | --- |
| 完成 | 38 | SHR-001~SHR-006, SHR-009~SHR-010, SAN-001~SAN-009, UI-001~UI-006, CHT-001~CHT-007, DAT-001~DAT-008 |
| 部分完成 | 2 | SHR-007, SHR-008 |
| 未完成 | 1 | UI-007 |

完成率：

- Wave 1 总体：38 / 41 完成，约 92.7%
- Wave 1 P0：38 / 40 完成，95%

已验证命令：

- `pnpm typecheck` 通过
- `pnpm test` 通过
- `pnpm exec tsx data/validate.ts` 通过

## Fixed Since Last Review

- `SAN-004` 已支持 `custom` 时间窗 selector。
- `CHT-003` 已去除对 `@health-advisor/sandbox` 的类型依赖。
- `DAT-008` 已扩展到 fallback/scenario/prompt 以及引用正确性校验。

## Findings

### P0: `custom timeframe` 的共享协议校验仍未闭环

`custom` 时间窗虽然已经加入类型与 selector，但共享 schema 和 page-context helper 仍允许构造缺失 `customDateRange` 的上下文，和 runtime 行为不一致。

- backlog 中 `SHR-007` 要求共享 schema 对非法输入抛出明确错误：[docs/full-project-task-backlog.md](/Users/xlzj/Desktop/Projects/health-advisor/docs/full-project-task-backlog.md:75)
- `PageContextSchema` 目前把 `customDateRange` 设为可选，没有对 `timeframe === 'custom'` 做联动约束：[packages/shared/src/schemas/agent.ts](/Users/xlzj/Desktop/Projects/health-advisor/packages/shared/src/schemas/agent.ts:16)
- `createPageContext` 也没有提供 `customDateRange` 参数，却会在 `timeframe='custom'` 时正常返回对象：[packages/shared/src/utils/page-context.ts](/Users/xlzj/Desktop/Projects/health-advisor/packages/shared/src/utils/page-context.ts:4)
- 我实际复现过：`PageContextSchema.safeParse({ profileId: 'p', page: 'x', timeframe: 'custom' })` 当前会错误通过；`createPageContext('p', 'x', 'custom')` 也会返回缺字段对象
- 与之相反，selector/runtime 已要求 `customDateRange` 必填：[packages/shared/src/utils/timeframe.ts](/Users/xlzj/Desktop/Projects/health-advisor/packages/shared/src/utils/timeframe.ts:10)

影响：Wave 2 的 context builder、store、API 参数校验如果依赖 shared schema/helper，会接受一个运行时必然报错的 `PageContext`，造成协议层和执行层不一致。

判定：

- `SHR-007` 部分完成
- `SHR-008` 部分完成

### P1: `UI-007` 仍缺少可视化 smoke story 或 demo page

- backlog 明确要求关键公共组件有最小验证页面或 story：[docs/full-project-task-backlog.md](/Users/xlzj/Desktop/Projects/health-advisor/docs/full-project-task-backlog.md:94)
- 当前 `apps/web` 仍只有占位首页：[apps/web/src/app/page.tsx](/Users/xlzj/Desktop/Projects/health-advisor/apps/web/src/app/page.tsx:1)
- 仓库中没有 `stories` / `storybook` / `demo` 相关文件

影响：不是 Wave 2 blocker，但基础组件的视觉和交互回归仍缺最小可视化验证入口。

判定：未完成。

## Assessment

Wave 2 前真正还需要补的 blocker 只剩一个：

1. 把 `PageContext` 的 `custom timeframe` 约束在 shared 层做实

建议最小修复范围：

1. 让 `PageContextSchema` 在 `timeframe === 'custom'` 时强制要求 `customDateRange`
2. 让 `createPageContext` 支持传入 `customDateRange`，或拒绝无范围的 `custom`
3. 为上述约束补共享单测

`UI-007` 可以继续留在 Wave 2 并行处理，不阻塞后端/Agent Core 基座推进。
