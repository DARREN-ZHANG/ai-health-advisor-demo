import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { AgentEvalCaseSchema } from './case-schema';
import type { AgentEvalCase, EvalSuite } from './types';

// ── 公共类型 ──────────────────────────────────────────

export interface LoadEvalCasesOptions {
  /** case 文件根目录，通常为 evals/cases */
  rootDir: string;
  /** 按 suite 过滤，不传则加载全部 */
  suite?: EvalSuite;
  /** 按 case id 过滤，不传则加载全部 */
  caseId?: string;
}

// ── 核心实现 ──────────────────────────────────────────

/**
 * 从 rootDir 递归读取 .json 文件，使用 AgentEvalCaseSchema 校验后返回。
 * - 跳过名为 "reports" 的目录
 * - case id 重复时抛出错误
 * - JSON 解析错误会附带文件路径信息
 */
export function loadEvalCases(options: LoadEvalCasesOptions): AgentEvalCase[] {
  const { rootDir, suite, caseId } = options;

  // 收集所有 .json 文件路径
  const jsonFiles = collectJsonFiles(rootDir);

  const cases: AgentEvalCase[] = [];
  const seenIds = new Map<string, string>(); // id -> filePath

  for (const filePath of jsonFiles) {
    // 读取并解析 JSON
    const rawContent = readFileSync(filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`JSON 解析失败 (${filePath}): ${message}`);
    }

    // 使用 Zod schema 校验，断言为 AgentEvalCase 以桥接 schema 推断与手写类型
    const evalCase = AgentEvalCaseSchema.parse(parsed) as AgentEvalCase;

    // 检查 case id 唯一性
    const existingFile = seenIds.get(evalCase.id);
    if (existingFile) {
      throw new Error(
        `case id 重复: "${evalCase.id}" 同时出现在 ${existingFile} 和 ${filePath}`,
      );
    }
    seenIds.set(evalCase.id, filePath);

    // 按 suite 过滤
    if (suite !== undefined && evalCase.suite !== suite) {
      continue;
    }

    // 按 caseId 过滤
    if (caseId !== undefined && evalCase.id !== caseId) {
      continue;
    }

    cases.push(evalCase);
  }

  return cases;
}

// ── 内部工具函数 ──────────────────────────────────────

/**
 * 递归收集目录下所有 .json 文件，跳过名为 "reports" 的目录
 */
function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];

  // 安全检查：目录不存在时直接返回空数组
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    // 跳过 reports 目录
    if (entry === 'reports') {
      continue;
    }

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归处理子目录
      const subFiles = collectJsonFiles(fullPath);
      results.push(...subFiles);
    } else if (stat.isFile() && extname(entry) === '.json') {
      results.push(fullPath);
    }
  }

  return results;
}
