# Wave 0 + Wave 1 Implementation Review

Review date: 2026-04-10

Scope: Review of Wave 0 and Wave 1 implementation status against `docs/full-project-task-backlog.md`.

---

## Wave 0 — 仓库与工程基座

### 总览

| 状态     | 数量 | 任务 ID                                                                                  |
| -------- | ---- | ---------------------------------------------------------------------------------------- |
| 完成     | 10   | OTH-001, OTH-002, OTH-003, OTH-005, OTH-006, OTH-007, OTH-008, OTH-009, OTH-010, OTH-013 |
| 部分完成 | 2    | OTH-004, OTH-012                                                                         |
| 未完成   | 1    | OTH-014                                                                                  |
| 需要验证 | 1    | OTH-011                                                                                  |

完成率：~71%（10/14 完全通过，2 部分完成）

### P0: OTH-014 — CI skeleton 缺失

`docs/full-project-task-backlog.md` 要求 CI 至少执行 install/typecheck/lint/test/build，失败能阻断合并。当前仓库没有 `.github/workflows/` 目录。

影响：回归问题可被合并到主分支而无自动门禁拦截。

### P0: OTH-004 — `packages/config` 为空壳

OTH-004 要求 config 包输出 ESLint/Prettier/Vitest/Playwright/TS 配置。当前 `packages/config/` 仅有一个空 `package.json`，没有导出任何配置文件。

影响：后续 Wave 1 的 UI/Charts 等包无法消费统一的共享配置。当前 ESLint、Prettier、Vitest 配置散落在根级和 app 级文件中，未走 `@health-advisor/config` 包。

### P1: OTH-012 — Vitest coverage 未配置

OTH-012 要求 coverage 输出正常。目前只有 `apps/web/vitest.config.ts` 存在（仅做 exclude），`apps/agent-api` 没有 Vitest 配置，脚本跑 `vitest run` 而无 coverage 参数。

### OTH-011 — Prettier 配置需确认

根级 Prettier 配置存在且 `pnpm format:check` 通过，但需确认是否通过 `@health-advisor/config` 消费（依赖 OTH-004）。

### 验证通过的命令

- `pnpm build` — 通过（Next.js 警告 ESLint 插件未检测到，与 OTH-004 相关）
- `pnpm lint` — 通过
- `pnpm typecheck` — 通过
- `pnpm test` — 通过
- `pnpm format:check` — 通过
- `pnpm test:e2e` — 通过（沙箱外运行）
- `pnpm dev` — 通过（端口已占用，现有进程响应正常）

### Wave 0 遗留问题清单

| 问题                                  | 优先级 | 阻塞的后续任务                                                                                          |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| CI skeleton 缺失                      | P0     | HD-011（固化质量门禁 pipeline）                                                                         |
| config 包为空壳                       | P0     | OTH-012（Vitest 基础配置）、Wave 1 所有包消费配置                                                       |
| Vitest coverage 未配置                | P1     | HD-012（coverage 门槛）                                                                                 |
| Wave 0 spec 与 backlog 关于 CI 的分歧 | 信息   | `docs/superpowers/specs/2026-04-10-wave0-foundation-design.md` 不要求 CI，backlog 要求。以 backlog 为准 |

---

## Wave 1 — 共享协议、数据与复用包基座

### 总览

| 模块     | 任务范围          | 完成数 | 总数   | 完成率 |
| -------- | ----------------- | ------ | ------ | ------ |
| Shared   | SHR-001 ~ SHR-010 | 0      | 10     | 0%     |
| Sandbox  | SAN-001 ~ SAN-009 | 0      | 9      | 0%     |
| UI       | UI-001 ~ UI-007   | 0      | 7      | 0%     |
| Charts   | CHT-001 ~ CHT-007 | 0      | 7      | 0%     |
| Data     | DAT-001 ~ DAT-008 | 0      | 8      | 0%     |
| **合计** |                   | **0**  | **41** | **0%** |

### 关键缺失

**所有 Wave 1 包均未创建：**

- `packages/shared/` — 不存在。这是跨模块协议的唯一真实来源，阻塞 Agent/Backend/Frontend。
- `packages/sandbox/` — 不存在。sandbox loader/selector/merge 未实现，阻塞只读接口与图表数据。
- `packages/ui/` — 不存在。设计 token、基础组件未封装，阻塞前端页面骨架。
- `packages/charts/` — 不存在。ECharts 适配层、option builder、token registry 未实现，阻塞图表渲染。
- `data/sandbox/` — 不存在。无 sandbox JSON 数据、fallback 文案、prompt 模板。

### 全局依赖分析

Wave 1 是 Wave 2-7 的前置依赖。按 backlog 的依赖矩阵：

```
SHR-002~SHR-010（共享协议） → 阻塞 Agent Core (Wave 2)、Backend (Wave 3)、Frontend (Wave 4)
SAN-002~SAN-009（Sandbox）  → 阻塞 Backend 只读接口、Context Builder、图表数据
UI-002~UI-006（UI 组件）    → 阻塞 Frontend 页面骨架 (Wave 4)
CHT-002~CHT-007（图表）     → 阻塞图表渲染、chart token 协议
DAT-002~DAT-008（数据资产）  → 阻塞 Agent prompt、fallback、场景脚本
```

### 最关键的任务路径

1. **SHR-001** → SHR-002（sandbox types）→ SHR-003（agent types）→ SHR-007（Zod schemas）→ SHR-008（工具函数）
2. **SHR-002** → SAN-001 → SAN-002（sandbox loader）→ SAN-003~008（selectors/merge）
3. **UI-001** → UI-002（design tokens）→ UI-003~006（基础组件）
4. **CHT-001** → CHT-002（ECharts 适配）→ CHT-004（option builders）→ CHT-006（token registry）
5. **DAT-001** → DAT-002~004（profile 数据）→ DAT-005~007（fallback/prompts/scenarios）

---

## 总结与建议

### 当前状态

- **Wave 0**：基础可用，但有 2 个 P0 缺陷（CI、config 包）和 1 个 P1（coverage）。所有根级命令通过。
- **Wave 1**：完全未启动。41 个任务均为 0%。

### 建议的执行优先级

1. **先补齐 Wave 0 遗留**（OTH-004 config 包 + OTH-012 coverage），以便 Wave 1 包能正确消费共享配置。
2. **启动 Wave 1 的 Shared 模块**（SHR-001~010），这是全局最大阻塞项。
3. **并行推进**：Shared 完成后，Sandbox/UI/Charts/Data 可按模块并行。
4. **CI skeleton（OTH-014）** 可在 Wave 1 进行中同步补齐，不阻塞 Wave 1 开发。
