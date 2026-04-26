# Agent Deterministic Eval Framework

## 1. Eval 目标

本框架用于对 Agent 输出进行**确定性的自动化质量评估**。通过 Fake Provider 模式，在无需调用真实 LLM 的前提下，对 Agent 的协议合规性、输出长度、状态颜色、Token 用量、关键提及、证据引用、安全合规、缺值处理、记忆一致性和任务完成度共 **10 个维度**进行打分。

核心价值：

- 重构或 prompt 变更后快速回归验证
- 作为 CI 门禁，防止质量回退
- 建立 baseline，量化 Agent 输出质量趋势

---

## 2. Suite 说明

| Suite | 用途 | Case 数量 | 说明 |
|-------|------|-----------|------|
| **smoke** | P0 冒烟测试 | 15 | 覆盖所有主要任务类型（homepage / view-summary / chat / cross-cutting），每个 case 验证核心路径 |
| **core** | P1 核心 Fixture 场景 | 55 | 覆盖更多边界条件和细分场景，按 category 组织子目录。使用 fake provider + fixture answer，用于框架健壮性回归 |
| **quality** | 真实 Agent 质量基线 | 暂无 | 使用 real provider 调用真实 LLM，禁止 fixture answer（`--disallow-fixtures`），用于评估 Agent 实际生成质量 |
| **regression** | 回归锁定 | 暂无 | 用于锁定已修复的 bug，防止复发。从真实 bug 报告沉淀 |

### Suite 运行策略

- **smoke**：CI 必跑，`--fail-on-hard` 硬失败门禁
- **core**（fixture）：本地全量回归，合并前验证框架健壮性，基线命名为 `framework-sanity-baseline-v1`
- **quality**：真实 Agent 质量基线，使用 real provider，基线命名为 `baseline-v1-real-single-call-agent`
- **regression**：按需运行，锁定已知 bug

---

## 3. Case JSON 结构

每个 eval case 是一个独立的 JSON 文件，主要字段如下：

```json
{
  "id": "H-001",               // Case 唯一标识
  "title": "首页摘要 - 正常状态", // 可读标题
  "suite": "smoke",            // 所属 suite: smoke | core | regression
  "category": "homepage",      // 功能分类
  "priority": "P0",            // 优先级: P0 | P1 | P2
  "tags": ["homepage", "normal"], // 标签，用于筛选
  "setup": {
    "profileId": "profile-a",  // 使用的沙箱用户档案
    "modelFixture": {          // Fake Provider 的固定响应
      "mode": "fake-json",
      "content": "{ ... }"     // 模拟的 LLM JSON 输出
    }
  },
  "request": {                 // Agent 请求参数
    "requestId": "eval-H001",
    "taskType": "homepage_summary",
    "pageContext": { ... }
  },
  "expectations": {            // 期望断言（各 scorer 对应字段）
    "protocol": { ... },
    "summary": { ... },
    "status": { ... },
    "safety": { ... }
  }
}
```

---

## 4. 如何运行

### 运行 Smoke Suite（15 个 P0 case）

```bash
pnpm --filter @health-advisor/agent-core eval:agent:smoke
```

### 运行 Core Fixture Suite（55 个 P1 case，fake provider）

```bash
pnpm --filter @health-advisor/agent-core eval:agent:core:fixture
```

### 运行 Quality Suite（真实 Agent 质量基线）

```bash
pnpm --filter @health-advisor/agent-core eval:agent:quality
```

> Quality Suite 使用 real provider 调用真实 LLM，启用 `--disallow-fixtures` 确保 case 不包含 `modelFixture.content`。适合 prompt 大幅重构后做端到端验证、版本发布前的全量质量确认、建立/更新 quality baseline。

### 运行单个 Case

```bash
pnpm --filter @health-advisor/agent-core eval:agent:case <case-id>
# 例如：
pnpm --filter @health-advisor/agent-core eval:agent:case H-001
```

> 除 quality suite 外，所有命令默认使用 `--provider fake`（不调用真实 LLM）和 `--report both`（同时输出 JSON 和 Markdown 报告）。Smoke 额外启用 `--fail-on-hard`，即硬失败时进程以非零退出码结束。Quality suite 使用 `--provider real` 和 `--disallow-fixtures`。

---

## 5. 如何查看 Report

运行完成后，报告生成在：

```
packages/agent-core/evals/reports/<timestamp>/
├── report.json          // 结构化 JSON 报告（机器可读）
└── report.md            // Markdown 报告（人类可读）
```

Markdown 报告包含：

- 总体通过率与分数汇总
- 各 case 的逐项 scorer 得分
- 失败 case 的详细原因

> `reports/` 目录已在 `.gitignore` 中排除，不会提交到仓库。

---

## 6. 如何添加新 Case

1. **确定 category 和 suite**：根据功能领域选择 `smoke/`、`core/<category>/`、`quality/` 或 `regression/` 目录
2. **创建 JSON 文件**：参考现有 case（如 `smoke/homepage-normal.json`）作为模板
3. **填写关键字段**：
   - `id` — 全局唯一，格式建议 `<类别缩写>-<序号>`（如 `C-016`）
   - `setup.modelFixture` — 设计 Fake Provider 应返回的内容（quality suite case **不包含** `modelFixture.content`，因为使用 real provider）
   - `expectations` — 声明各 scorer 的期望值
4. **本地验证**：
   ```bash
   pnpm --filter @health-advisor/agent-core eval:agent:case <新case-id>
   ```
5. **提交**：将 JSON 文件加入 git

---

## 7. 真实 Provider Eval 为什么不进默认 CI

| 原因 | 说明 |
|------|------|
| **成本** | 每次运行需调用 LLM API，55 个 core case 反复执行会产生可观费用 |
| **稳定性** | LLM 输出具有非确定性，相同 prompt 可能产生不同响应，导致结果 flaky |
| **延迟** | 真实调用耗时较长，不适合作为 CI 快速门禁 |
| **可重复性** | Deterministic eval 使用 Fake Provider，保证同样的 case 始终得到同样的分数 |

真实 Provider Eval 适合在以下场景手动执行：

- Prompt 大幅重构后做端到端验证
- 版本发布前的全量质量确认
- 建立/更新 quality baseline

如需使用真实 Provider 运行 eval，可将 `--provider fake` 替换为 `--provider real`（需配置有效的 LLM API Key）。

---

## 目录结构

```
packages/agent-core/evals/
├── README.md              # 本文档
├── cases/
│   ├── smoke/             # 15 个 P0 冒烟 case
│   ├── core/              # 55 个 P1 核心 case（按 category 分目录）
│   │   ├── homepage/
│   │   ├── view-summary/
│   │   ├── advisor-chat/
│   │   └── cross-cutting/
│   ├── quality/           # 真实 Agent 质量基线 case（不包含 modelFixture.content）
│   └── regression/        # 回归锁定 case（按需沉淀）
└── reports/               # 运行报告（gitignored）
```
