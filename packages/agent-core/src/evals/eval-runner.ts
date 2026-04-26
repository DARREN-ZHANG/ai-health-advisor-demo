/**
 * Eval Runner：评测主流程。
 *
 * 解析 CLI 参数 → 加载 case → 创建 runtime → 执行 agent → 评分 → 汇总 → 写报告 → 设置退出码。
 * 不依赖第三方 CLI 库，使用 process.argv 做简单参数解析。
 */

import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { loadEvalCases } from './case-loader';
import { createEvalRuntime } from './eval-runtime';
import { executeAgent, type AgentRuntimeObserver, type AgentRuntimeDeps } from '../runtime/agent-runtime';
import { DEFAULT_SCORERS } from './scorers';
import { writeReport, type ReportFormat } from './report-writer';
import type {
  AgentEvalCase,
  EvalProviderMode,
  EvalArtifacts,
  EvalCaseResult,
  EvalReport,
  EvalSuite,
} from './types';
import type { AgentResponseEnvelope } from '@health-advisor/shared';

// ── CLI 参数解析 ────────────────────────────────────────

interface CliArgs {
  suite?: EvalSuite;
  caseId?: string;
  provider: EvalProviderMode;
  report: ReportFormat;
  output?: string;
  failOnHard: boolean;
  baselineReport?: string;
  failOnScoreRegression?: number;
  disallowFixtures: boolean;
}

/**
 * 从 process.argv 中解析命名参数。
 * 支持 --key value 和 --flag（布尔标志）格式。
 */
function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    provider: 'fake',
    report: 'both',
    failOnHard: false,
    disallowFixtures: false,
  };

  let i = 2; // 跳过 node 和脚本路径
  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--suite':
        args.suite = argv[++i] as EvalSuite;
        break;
      case '--case':
        args.caseId = argv[++i];
        break;
      case '--provider':
        args.provider = argv[++i] as EvalProviderMode;
        break;
      case '--report':
        args.report = argv[++i] as ReportFormat;
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--fail-on-hard':
        args.failOnHard = true;
        break;
      case '--baseline-report':
        args.baselineReport = argv[++i];
        break;
      case '--fail-on-score-regression':
        args.failOnScoreRegression = Number(argv[++i]);
        break;
      case '--disallow-fixtures':
        args.disallowFixtures = true;
        break;
      default:
        // 未知参数忽略
        break;
    }
    i++;
  }

  return args;
}

// ── Artifact 采集 Observer ──────────────────────────────

/**
 * 创建一个 observer 用于在 agent 执行过程中采集 artifacts。
 */
function createArtifactObserver(evalCase: AgentEvalCase): {
  observer: AgentRuntimeObserver;
  getArtifacts: () => EvalArtifacts;
} {
  const artifacts: Partial<EvalArtifacts> = {
    caseId: evalCase.id,
    request: evalCase.request,
  };

  const observer: AgentRuntimeObserver = {
    onContextBuilt(ctx) {
      artifacts.context = ctx;
    },
    onRulesEvaluated(rules) {
      artifacts.rulesResult = rules;
    },
    onPromptBuilt(input) {
      artifacts.systemPrompt = input.systemPrompt;
      artifacts.taskPrompt = input.taskPrompt;
    },
    onModelOutput(raw) {
      artifacts.rawOutput = raw;
    },
    onParsed(envelope) {
      artifacts.envelope = envelope;
    },
    onFallback() {
      // fallback 事件记录，不影响 artifacts
    },
  };

  return {
    observer,
    getArtifacts: () => artifacts as EvalArtifacts,
  };
}

// ── 单 case 执行 ───────────────────────────────────────

/**
 * 执行单个评测 case。
 *
 * 1. 创建 eval runtime
 * 2. 通过 observer 采集执行过程 artifacts
 * 3. 执行 agent
 * 4. 使用 DEFAULT_SCORERS 评分
 * 5. 返回 EvalCaseResult
 */
async function runSingleCase(
  evalCase: AgentEvalCase,
  providerMode: EvalProviderMode,
  dataDir?: string,
  strictAssets?: boolean,
): Promise<EvalCaseResult> {
  // 创建 observer 采集 artifacts
  const { observer, getArtifacts } = createArtifactObserver(evalCase);

  // 创建运行时依赖（可能因 provider 配置或 strict assets 失败）
  let deps: AgentRuntimeDeps;
  try {
    deps = createEvalRuntime({
      evalCase,
      dataDir,
      providerMode,
      strictAssets,
    });
  } catch (err) {
    // runtime 创建失败，记录错误
    const artifacts = getArtifacts();
    return buildErrorCaseResult(evalCase, artifacts, err);
  }

  let envelope: AgentResponseEnvelope | undefined;
  try {
    // 执行 agent，超时 6s
    envelope = await executeAgent(evalCase.request, deps, 6000, observer);
  } catch (err) {
    // 执行异常，记录错误信息
    const artifacts = getArtifacts();
    return buildErrorCaseResult(evalCase, artifacts, err);
  }

  const artifacts = getArtifacts();
  // 使用 observer 采集到的 envelope（可能与返回值不同，以 observer 为准）
  const capturedEnvelope = artifacts.envelope ?? envelope;

  // 运行所有 scorer
  const allChecks = DEFAULT_SCORERS.flatMap((scorer) =>
    scorer.score({ evalCase, envelope: capturedEnvelope, artifacts }),
  );

  // 计算总分
  const { score, maxScore } = aggregateScores(allChecks);

  // 判断 passed：所有 hard 检查通过
  const passed = allChecks
    .filter((c) => c.severity === 'hard')
    .every((c) => c.passed);

  return {
    caseId: evalCase.id,
    category: evalCase.category,
    passed,
    score,
    maxScore,
    checks: allChecks,
    artifacts,
  };
}

/** 构建执行异常时的 EvalCaseResult */
function buildErrorCaseResult(
  evalCase: AgentEvalCase,
  artifacts: EvalArtifacts,
  err: unknown,
): EvalCaseResult {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const errorArtifacts: EvalArtifacts = {
    ...artifacts,
    thrownError: errorMessage,
  };

  return {
    caseId: evalCase.id,
    category: evalCase.category,
    passed: false,
    score: 0,
    maxScore: 1,
    checks: [
      {
        checkId: `${evalCase.id}:runtime:error`,
        severity: 'hard',
        passed: false,
        score: 0,
        maxScore: 1,
        message: `执行异常: ${errorMessage}`,
      },
    ],
    artifacts: errorArtifacts,
  };
}

/** 汇总 check 分数 */
function aggregateScores(checks: Array<{ score: number; maxScore: number }>): {
  score: number;
  maxScore: number;
} {
  return checks.reduce(
    (acc, c) => ({
      score: acc.score + c.score,
      maxScore: acc.maxScore + c.maxScore,
    }),
    { score: 0, maxScore: 0 },
  );
}

// ── 报告聚合 ──────────────────────────────────────────

/**
 * 将多个 EvalCaseResult 聚合为 EvalReport。
 */
function aggregateReport(
  caseResults: EvalCaseResult[],
  suite: string,
  providerMode: EvalProviderMode,
): EvalReport {
  // 汇总 by category
  const byCategory: EvalReport['byCategory'] = {};
  let totalScore = 0;
  let totalMaxScore = 0;

  for (const result of caseResults) {
    const category = result.category;

    if (!byCategory[category]) {
      byCategory[category] = { cases: 0, passed: 0, failed: 0, score: 0, maxScore: 0 };
    }
    const cat = byCategory[category]!;
    cat.cases += 1;
    cat.score += result.score;
    cat.maxScore += result.maxScore;
    if (result.passed) {
      cat.passed += 1;
    } else {
      cat.failed += 1;
    }

    totalScore += result.score;
    totalMaxScore += result.maxScore;
  }

  const hardFailures = caseResults.filter(
    (r) => !r.passed,
  ).length;

  return {
    runId: generateRunId(),
    gitSha: getGitSha(),
    createdAt: new Date().toISOString(),
    suite,
    providerMode,
    totals: {
      cases: caseResults.length,
      passed: caseResults.filter((r) => r.passed).length,
      failed: caseResults.filter((r) => !r.passed).length,
      hardFailures,
      score: totalScore,
      maxScore: totalMaxScore,
    },
    byCategory,
    cases: caseResults,
  };
}

/** 生成 runId */
function generateRunId(): string {
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 获取当前 git SHA */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

// ── Baseline 对比 ──────────────────────────────────────

/**
 * 读取 baseline report 并比较 score regression。
 * 返回 true 表示存在 regression（应失败）。
 */
function checkScoreRegression(
  currentReport: EvalReport,
  baselinePath: string,
  threshold: number,
): { hasRegression: boolean; message: string } {
  let baseline: EvalReport;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs');
    const raw = fs.readFileSync(baselinePath, 'utf-8');
    baseline = JSON.parse(raw) as EvalReport;
  } catch {
    return {
      hasRegression: true,
      message: `无法读取 baseline report: ${baselinePath}`,
    };
  }

  const currentRatio = currentReport.totals.maxScore > 0
    ? (currentReport.totals.score / currentReport.totals.maxScore) * 100
    : 0;
  const baselineRatio = baseline.totals.maxScore > 0
    ? (baseline.totals.score / baseline.totals.maxScore) * 100
    : 0;

  const regression = baselineRatio - currentRatio;
  if (regression > threshold) {
    return {
      hasRegression: true,
      message: `Score regression detected: ${baselineRatio.toFixed(2)}% -> ${currentRatio.toFixed(2)}% (下降 ${regression.toFixed(2)} 个百分点，阈值 ${threshold})`,
    };
  }

  return {
    hasRegression: false,
    message: `Score comparison: ${baselineRatio.toFixed(2)}% -> ${currentRatio.toFixed(2)}% (下降 ${regression.toFixed(2)} 个百分点)`,
  };
}

// ── 主入口 ──────────────────────────────────────────────

/**
 * Eval Runner 主函数。
 *
 * 供 CLI 调用，也支持编程式调用。
 * 返回退出码：0 = 成功，1 = 失败。
 */
export async function runEval(
  argv: string[],
  options?: {
    /** case 文件根目录，默认 <package-root>/evals/cases */
    caseRootDir?: string;
    /** sandbox 数据目录 */
    dataDir?: string;
  },
): Promise<number> {
  const args = parseArgs(argv);
  const packageRoot = resolve(__dirname, '../..');
  const caseRootDir = options?.caseRootDir ?? join(packageRoot, 'evals', 'cases');
  // 从 packageRoot 上溯到 repo 根（包含 data/sandbox 的目录）
  const dataDir = options?.dataDir ?? resolve(packageRoot, '../../data/sandbox');

  // 仅当使用默认 dataDir（非显式传入）时验证目录存在
  if (!options?.dataDir && !existsSync(dataDir)) {
    console.error(`错误: 默认数据目录不存在: ${dataDir}`);
    console.error('请确保从正确的仓库路径运行，或通过 options.dataDir 指定路径。');
    return 1;
  }

  // CLI 调用时使用 strictAssets，测试通过 options.dataDir 调用时不用 strict
  const useStrictAssets = !options?.dataDir;

  // 参数校验：提供了 --fail-on-score-regression 但缺少 --baseline-report
  if (args.failOnScoreRegression !== undefined && !args.baselineReport) {
    console.error('错误: 提供了 --fail-on-score-regression 但缺少 --baseline-report');
    return 1;
  }

  // 1. 加载 cases
  const cases = loadEvalCases({
    rootDir: caseRootDir,
    suite: args.suite,
    caseId: args.caseId,
  });

  if (cases.length === 0) {
    console.error('未找到匹配的评测 case');
    return 1;
  }

  console.log(`加载了 ${cases.length} 个评测 case`);

  // --disallow-fixtures 执行：禁止 case 包含 modelFixture.content
  const disallowFixtures = args.disallowFixtures || args.suite === 'quality';
  if (disallowFixtures) {
    for (const evalCase of cases) {
      if (evalCase.setup.modelFixture?.content) {
        console.error(`错误: case ${evalCase.id} 包含 modelFixture.content，与 --disallow-fixtures 冲突`);
        return 1;
      }
    }
  }

  // 2. 逐个执行
  const caseResults: EvalCaseResult[] = [];
  for (const evalCase of cases) {
    console.log(`执行 case: ${evalCase.id} (${evalCase.title})`);
    const result = await runSingleCase(evalCase, args.provider, dataDir, useStrictAssets);
    caseResults.push(result);

    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  [${status}] score: ${result.score}/${result.maxScore}`);
  }

  // 3. 聚合报告
  const suiteName = args.suite ?? (args.caseId ? 'single' : 'all');
  const report = aggregateReport(caseResults, suiteName, args.provider);

  // real 模式时添加 provider/model 信息
  if (args.provider === 'real') {
    try {
      const { resolveProviderConfig } = require('../provider/provider-config') as typeof import('../provider/provider-config');
      const config = resolveProviderConfig(process.env as Record<string, string | undefined>);
      report.provider = config.provider;
      report.model = config.model;
    } catch {
      // 模块加载失败时忽略，不影响报告输出
    }
  }

  // 4. 写报告
  const outputDir = args.output ?? join(packageRoot, 'evals', 'reports', formatTimestamp());
  const reportPaths = writeReport(report, outputDir, args.report);
  console.log(`报告已写入: ${outputDir}`);
  if (reportPaths.jsonPath) console.log(`  JSON: ${reportPaths.jsonPath}`);
  if (reportPaths.mdPath) console.log(`  Markdown: ${reportPaths.mdPath}`);

  // 5. 判断退出码
  let exitCode = 0;

  // hard failure 检查
  if (args.failOnHard && report.totals.hardFailures > 0) {
    console.error(`存在 ${report.totals.hardFailures} 个 hard failure`);
    exitCode = 1;
  }

  // score regression 检查
  if (args.failOnScoreRegression !== undefined && args.baselineReport) {
    const regressionResult = checkScoreRegression(
      report,
      args.baselineReport,
      args.failOnScoreRegression,
    );
    console.log(regressionResult.message);
    if (regressionResult.hasRegression) {
      exitCode = 1;
    }
  }

  // 汇总输出
  console.log('\n=== 评测汇总 ===');
  console.log(`Cases: ${report.totals.cases}`);
  console.log(`Passed: ${report.totals.passed}`);
  console.log(`Failed: ${report.totals.failed}`);
  console.log(`Hard Failures: ${report.totals.hardFailures}`);
  const scoreRatio = report.totals.maxScore > 0
    ? ((report.totals.score / report.totals.maxScore) * 100).toFixed(1)
    : '0.0';
  console.log(`Score: ${report.totals.score}/${report.totals.maxScore} (${scoreRatio}%)`);
  console.log(`Exit Code: ${exitCode}`);

  return exitCode;
}

/** 格式化时间戳用于报告目录名 */
function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

// ── CLI 直接执行入口 ──────────────────────────────────

// 当直接运行此文件时（tsx eval-runner.ts），自动执行
const isDirectRun = process.argv[1]?.endsWith('eval-runner.ts');
if (isDirectRun) {
  runEval(process.argv).then((exitCode) => {
    process.exit(exitCode);
  }).catch((err) => {
    console.error('Runner 异常退出:', err);
    process.exit(1);
  });
}
