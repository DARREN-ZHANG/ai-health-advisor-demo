/**
 * LLM 连通性测试脚本（支持多角色）
 *
 * 用法：
 *   node apps/agent-api/src/scripts/test-llm.mjs            # 测试全部角色
 *   node apps/agent-api/src/scripts/test-llm.mjs --role solver   # 只测试 solver
 *   node apps/agent-api/src/scripts/test-llm.mjs --role planner  # 只测试 planner
 *   node apps/agent-api/src/scripts/test-llm.mjs --role reviewer # 只测试 reviewer
 *
 * 从 apps/agent-api/.env 读取配置，按角色解析环境变量（支持 PLANNER_LLM_* / REVIEWER_LLM_* 回退到 LLM_*），
 * 向各角色 LLM 发送简单消息，验证连通性。
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';

// 加载 agent-api/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// ── 角色定义 ──────────────────────────────────────────

const ROLES = ['solver', 'planner', 'reviewer'];

/**
 * 解析角色 CLI 参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const roleIdx = args.indexOf('--role');
  if (roleIdx !== -1 && args[roleIdx + 1]) {
    const role = args[roleIdx + 1];
    if (!ROLES.includes(role)) {
      console.error(`❌ 不支持的角色: ${role}，可选值: ${ROLES.join(', ')}`);
      process.exit(1);
    }
    return [role];
  }
  return ROLES;
}

/**
 * 按角色解析 LLM 配置（复用与 resolveProviderConfig 相同的回退逻辑）
 *
 * solver  → LLM_*
 * planner → PLANNER_LLM_* → LLM_*
 * reviewer → REVIEWER_LLM_* → LLM_*
 */
function resolveRoleConfig(role) {
  const prefix = role === 'solver' ? 'LLM' : `${role.toUpperCase()}_LLM`;

  const provider = process.env[`${prefix}_PROVIDER`] ?? process.env.LLM_PROVIDER ?? 'openai';
  const model = process.env[`${prefix}_MODEL`] ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const apiKey = process.env[`${prefix}_API_KEY`] ?? process.env.LLM_API_KEY ?? '';
  const baseUrl = process.env[`${prefix}_BASE_URL`] ?? process.env.LLM_BASE_URL ?? '';
  const timeout = process.env[`${prefix}_TIMEOUT_MS`]
    ? parseInt(process.env[`${prefix}_TIMEOUT_MS`], 10)
    : (process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : 60000);
  const temperature = process.env[`${prefix}_TEMPERATURE`]
    ? parseFloat(process.env[`${prefix}_TEMPERATURE`])
    : (process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0);

  return { provider, model, apiKey, baseUrl, timeout, temperature };
}

// ── ChatModel 创建 ────────────────────────────────────

async function createChatModel(cfg) {
  switch (cfg.provider) {
    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        modelName: cfg.model,
        openAIApiKey: cfg.apiKey,
        configuration: cfg.baseUrl ? { baseURL: cfg.baseUrl } : undefined,
        temperature: cfg.temperature,
        maxRetries: 0,
        timeout: cfg.timeout,
      });
    }
    case 'gemini': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      return new ChatGoogleGenerativeAI({
        model: cfg.model,
        apiKey: cfg.apiKey,
        temperature: cfg.temperature,
        maxRetries: 0,
        timeout: cfg.timeout,
      });
    }
    case 'anthropic': {
      console.error('   Anthropic provider 暂未安装对应依赖包 (@langchain/anthropic)');
      console.error('   请运行: pnpm add -D @langchain/anthropic');
      return null;
    }
    default: {
      console.error(`   不支持的 provider: ${cfg.provider}，可选值: openai, gemini, anthropic`);
      return null;
    }
  }
}

// ── 单角色测试 ────────────────────────────────────────

/** 各角色的测试 prompt */
const ROLE_PROMPTS = {
  solver: '你好，请用一句话回复确认你在线。这是 solver 角色的连通性测试。',
  planner: '你好，请用 JSON 格式回复 {"status":"ok"}。这是 planner 角色的连通性测试。',
  reviewer: '你好，请回复 "approved": true。这是 reviewer 角色的连通性测试。',
};

function maskKey(key) {
  if (!key) return '(未设置)';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

async function testRole(role) {
  const cfg = resolveRoleConfig(role);

  console.log(`  Provider:    ${cfg.provider}`);
  console.log(`  Model:       ${cfg.model}`);
  console.log(`  Base URL:    ${cfg.baseUrl || '(默认)'}`);
  console.log(`  API Key:     ${maskKey(cfg.apiKey)}`);
  console.log(`  Temperature: ${cfg.temperature}`);
  console.log(`  Timeout:     ${cfg.timeout}ms`);

  if (!cfg.apiKey) {
    console.log('  ⚠️  API Key 未配置，跳过\n');
    return { role, ok: false, reason: 'API Key 未配置' };
  }

  const chatModel = await createChatModel(cfg);
  if (!chatModel) {
    console.log('  ⚠️  无法创建 ChatModel，跳过\n');
    return { role, ok: false, reason: '无法创建 ChatModel' };
  }

  const start = Date.now();
  try {
    const prompt = ROLE_PROMPTS[role];
    const response = await chatModel.invoke([new HumanMessage(prompt)]);
    const elapsed = Date.now() - start;
    const content = typeof response.content === 'string'
      ? response.content.slice(0, 120)
      : JSON.stringify(response.content).slice(0, 120);

    console.log(`  ✅ 连接成功！耗时 ${elapsed}ms`);
    console.log(`  响应: ${content}${response.content.length > 120 ? '...' : ''}\n`);
    return { role, ok: true, elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ 连接失败！耗时 ${elapsed}ms`);
    console.log(`  错误: ${message}\n`);
    return { role, ok: false, reason: message };
  }
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const roles = parseArgs();

  console.log('=== LLM 连通性测试 ===\n');

  const results = [];
  for (const role of roles) {
    console.log(`── ${role.toUpperCase()} ──`);
    results.push(await testRole(role));
  }

  // 汇总
  console.log('── 汇总 ──');
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`  通过: ${passed}/${results.length}`);

  if (failed > 0) {
    const failedRoles = results.filter((r) => !r.ok).map((r) => `${r.role}: ${r.reason}`);
    console.log(`  失败:\n${failedRoles.map((r) => `    - ${r}`).join('\n')}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
