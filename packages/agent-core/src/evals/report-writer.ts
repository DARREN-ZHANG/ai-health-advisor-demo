/**
 * Report Writer：评测报告生成器。
 *
 * 支持 JSON 和 Markdown 两种格式的报告输出。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalReport, EvalCaseResult, EvalCheckResult } from './types';

// ── 公共类型 ────────────────────────────────────────────

export type ReportFormat = 'json' | 'markdown' | 'both';

export interface ReportPaths {
  jsonPath?: string;
  mdPath?: string;
}

// ── 主入口 ──────────────────────────────────────────────

/**
 * 写入评测报告。
 *
 * 根据 format 参数决定输出 JSON 和/或 Markdown 格式。
 * 自动创建输出目录。
 */
export function writeReport(
  report: EvalReport,
  outputDir: string,
  format: ReportFormat,
): ReportPaths {
  // 确保输出目录存在
  mkdirSync(outputDir, { recursive: true });

  const paths: ReportPaths = {};

  if (format === 'json' || format === 'both') {
    paths.jsonPath = writeJsonReport(report, outputDir);
  }

  if (format === 'markdown' || format === 'both') {
    paths.mdPath = writeMarkdownReport(report, outputDir);
  }

  return paths;
}

// ── JSON 报告 ─────────────────────────────────────────

function writeJsonReport(report: EvalReport, outputDir: string): string {
  const filePath = join(outputDir, 'eval-report.json');
  writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

// ── Markdown 报告 ─────────────────────────────────────

function writeMarkdownReport(report: EvalReport, outputDir: string): string {
  const content = buildMarkdownContent(report);
  const filePath = join(outputDir, 'eval-report.md');
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/** 构建 Markdown 报告内容 */
function buildMarkdownContent(report: EvalReport): string {
  const lines: string[] = [];

  // 标题
  lines.push('# Eval Report');
  lines.push('');

  // 概要信息
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Run ID**: ${report.runId}`);
  if (report.gitSha) {
    lines.push(`- **Git SHA**: ${report.gitSha}`);
  }
  lines.push(`- **Created At**: ${report.createdAt}`);
  lines.push(`- **Suite**: ${report.suite}`);
  lines.push(`- **Provider Mode**: ${report.providerMode}`);
  if (report.runConfig) {
    lines.push(`- **Git Dirty**: ${report.runConfig.gitDirty}`);
    lines.push(`- **Timeout**: ${report.runConfig.timeoutMs}ms`);
    lines.push(`- **Case Root**: ${report.runConfig.caseRootDir}`);
    lines.push(`- **Data Dir**: ${report.runConfig.dataDir}`);
  }
  lines.push('');

  // 总分
  const scoreRatio = report.totals.maxScore > 0
    ? ((report.totals.score / report.totals.maxScore) * 100).toFixed(1)
    : '0.0';
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Cases | ${report.totals.cases} |`);
  lines.push(`| Passed | ${report.totals.passed} |`);
  lines.push(`| Failed | ${report.totals.failed} |`);
  lines.push(`| Hard Failures | ${report.totals.hardFailures} |`);
  lines.push(`| Score | ${report.totals.score}/${report.totals.maxScore} (${scoreRatio}%) |`);
  lines.push('');

  // Hard failures
  const hardFailureCases = report.cases.filter((c) => !c.passed);
  if (hardFailureCases.length > 0) {
    lines.push('## Hard Failures');
    lines.push('');
    for (const fc of hardFailureCases) {
      const hardChecks = fc.checks.filter(
        (ch) => ch.severity === 'hard' && !ch.passed,
      );
      lines.push(`### ${fc.caseId}`);
      lines.push('');
      lines.push(`Score: ${fc.score}/${fc.maxScore}`);
      lines.push('');
      lines.push('Failed hard checks:');
      lines.push('');
      for (const check of hardChecks) {
        lines.push(`- [FAIL] ${check.checkId}: ${check.message}`);
      }
      lines.push('');
    }
  }

  // Category breakdown
  lines.push('## Category Breakdown');
  lines.push('');
  if (Object.keys(report.byCategory).length > 0) {
    lines.push('| Category | Cases | Passed | Failed | Score |');
    lines.push('|----------|-------|--------|--------|-------|');
    for (const [category, data] of Object.entries(report.byCategory)) {
      const catRatio = data.maxScore > 0
        ? ((data.score / data.maxScore) * 100).toFixed(1)
        : '0.0';
      lines.push(
        `| ${category} | ${data.cases} | ${data.passed} | ${data.failed} | ${data.score}/${data.maxScore} (${catRatio}%) |`,
      );
    }
    lines.push('');
  } else {
    lines.push('_No category data available_');
    lines.push('');
  }

  // Failed case details
  const failedCases = report.cases.filter((c) => !c.passed);
  if (failedCases.length > 0) {
    lines.push('## Failed Case Details');
    lines.push('');
    for (const fc of failedCases) {
      lines.push(`### ${fc.caseId}`);
      lines.push('');
      lines.push(`Score: ${fc.score}/${fc.maxScore}`);
      lines.push('');
      lines.push('All checks:');
      lines.push('');
      renderCheckResults(lines, fc.checks);
      lines.push('');
    }
  }

  // Envelope summary
  lines.push('## Envelope Summary');
  lines.push('');
  for (const c of report.cases) {
    const envelope = c.artifacts.envelope;
    if (envelope) {
      lines.push(`- **${c.caseId}**: source=${envelope.source ?? 'N/A'}, statusColor=${envelope.statusColor ?? 'N/A'}, finishReason=${envelope.meta?.finishReason ?? 'N/A'}`);
    } else {
      lines.push(`- **${c.caseId}**: _no envelope_`);
    }
  }
  lines.push('');

  // Failed checks
  const allFailedChecks = report.cases.flatMap((c) =>
    c.checks.filter((ch) => !ch.passed),
  );
  if (allFailedChecks.length > 0) {
    lines.push('## Failed Checks');
    lines.push('');
    for (const check of allFailedChecks) {
      lines.push(`- [${check.severity.toUpperCase()}] ${check.checkId}: ${check.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** 渲染 check 结果列表 */
function renderCheckResults(lines: string[], checks: EvalCheckResult[]): void {
  for (const check of checks) {
    const icon = check.passed ? 'PASS' : 'FAIL';
    const severity = `[${check.severity.toUpperCase()}]`;
    lines.push(`- [${icon}] ${severity} ${check.checkId}: ${check.message} (${check.score}/${check.maxScore})`);
  }
}
