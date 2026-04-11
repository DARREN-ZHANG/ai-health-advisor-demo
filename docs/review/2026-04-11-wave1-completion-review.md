# Wave 1 Completion Review

Review date: 2026-04-11

Scope: Review current repository status against Wave 1 in `docs/full-project-task-backlog.md`.

## Summary

| 状态 | 数量 | 任务 |
| --- | ---: | --- |
| 完成 | 37 | SHR-001~SHR-010, SAN-001~SAN-003, SAN-005~SAN-009, UI-001~UI-006, CHT-001~CHT-002, CHT-004~CHT-007, DAT-001~DAT-007 |
| 部分完成 | 3 | SAN-004, CHT-003, DAT-008 |
| 未完成 | 1 | UI-007 |

完成率：

- Wave 1 总体：37 / 41 完成，约 90%
- Wave 1 P0：37 / 40 完成，约 92.5%

已验证命令：

- `pnpm typecheck` 通过
- `pnpm test` 通过
- `pnpm exec tsx data/validate.ts` 通过

## Findings

### P0: SAN-004 未满足 `custom` 时间窗要求

backlog 要求 `day/week/month/year/custom` 全部支持，但当前共享协议和 selector 都只支持前四种。

- `packages/shared/src/types/agent.ts:11` 的 `Timeframe` 没有 `custom`
- `packages/shared/src/schemas/agent.ts:9` 的 `TimeframeSchema` 没有 `custom`
- `packages/shared/src/constants/timeframes.ts:8` 只配置了 `day/week/month/year`
- `packages/sandbox/src/selectors/date-range.ts:17` 仅接受 `Timeframe`，没有额外 `DateRange` 输入来表达自定义窗口

影响：Wave 2 的 context builder 和 Wave 3 的 timeline/data-center 路由都会依赖时间窗协议；如果此时继续往上层开发，后面会反向修改共享协议和只读接口。

判定：部分完成。

### P0: CHT-003 仍然直接依赖 sandbox 类型

backlog 明确要求 charts 的时间序列标准化工具“不直接依赖 sandbox 代码”。当前实现仍从 sandbox 包导入 `TimelinePoint`。

- `packages/charts/src/utils/normalize.ts:1` 直接 `import type { TimelinePoint } from '@health-advisor/sandbox'`
- 对应测试 `packages/charts/src/utils/normalize.test.ts:3` 也依赖 `@health-advisor/sandbox`

影响：charts 包没有形成独立的 view model 边界，Wave 2/3/4 一旦需要在非 sandbox 数据源上复用 charts，就会被当前依赖方向反向耦合。

判定：部分完成。

### P0: DAT-008 校验脚本没有覆盖 fallback/scenario/引用正确性

DAT-008 的 DoD 是“校验 schema、必填字段、日期连续性与引用正确性”。当前脚本只校验了 profile 加载、固定 14 天记录数和日期连续性。

- `data/validate.ts:35-79` 仅遍历 `manifest.profiles`
- `data/validate.ts:63-64` 只检查 `records.length === 14`
- 脚本没有读取或校验 `fallbacks/*.json`
- 脚本没有读取或校验 `prompts/*.md`
- 脚本没有读取或校验 `scenarios/manifest.json`
- 脚本没有检查 fallback 中的 `chartTokens`、scenario 中的 `profileId` 是否引用到真实白名单/真实 profile

影响：当前脚本“通过”只能说明 profile JSON 基本有效，不能说明 Wave 2/3 依赖的数据资产是完整且可引用的。

判定：部分完成。

### P1: UI-007 仍缺少可视化 smoke story 或 demo page

UI 公共组件虽然有单元测试，但仓库中还没有最小可视化验证入口。

- `docs/full-project-task-backlog.md:94` 要求关键公共组件有最小验证页面或 story
- `rg --files | rg "stories|story|demo|storybook"` 无结果
- 当前 `apps/web/src/app/page.tsx:1` 仍是纯占位页，没有作为 UI smoke/demo 使用

影响：不是 Wave 2 blocker，但会降低后续前端集成时对基础组件观感和交互回归的发现速度。

判定：未完成。

## Assessment

Wave 2 前，建议至少先补以下 3 个 P0：

1. 先冻结 `custom` 时间窗协议和 selector 形态
2. 将 charts 标准化输入类型下沉到 `shared` 或 `charts` 自身，移除对 sandbox 的类型依赖
3. 把 `data/validate.ts` 扩展到 fallback/scenario/引用校验

如果只想最小代价进入 Wave 2，优先级建议是：

1. `SAN-004`
2. `DAT-008`
3. `CHT-003`
4. `UI-007`
