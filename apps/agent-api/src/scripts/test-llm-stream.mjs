/**
 * LLM 流式能力探针（仅测 solver 角色）
 *
 * 用法：
 *   node apps/agent-api/src/scripts/test-llm-stream.mjs
 *   node apps/agent-api/src/scripts/test-llm-stream.mjs --role solver
 *
 * 从 apps/agent-api/.env 读取配置，按角色解析环境变量（solver 直接用 LLM_*），
 * 调用 chatModel.stream() 验证中转站的流式能力。
 *
 * 输出仅包含统计指标（provider/model/脱敏 origin/latency/chunk 数/finish reason），
 * 绝不打印模型响应正文，也不打印完整 API key。
 *
 * 通过条件：
 *   - 收到至少 2 个非空 content chunk
 *   - 流正常结束（有 finish reason）
 *   - 总文本非空（总字符数 > 0）
 *   - AbortSignal 取消测试在超时预算内停止
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';

// 加载 agent-api/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// ── 常量 ──────────────────────────────────────────────

const SUPPORTED_ROLES = ['solver'];

// AbortSignal 取消测试的超时预算（ms）。超时未停止视为失败。
const ABORT_TEST_TIMEOUT_MS = 5000;

// 流式整体超时（ms），防止上游挂死。
const STREAM_TIMEOUT_MS = 60000;

// 探针 prompt：要求模型输出足够长的文本，保证至少产生 2 个非空 chunk。
const PROBE_PROMPT = '请用三到五句话介绍一下健康饮食的基本原则，每句话都要完整。这是流式能力探针测试。';

// ── CLI 参数解析 ──────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const roleIdx = args.indexOf('--role');
  const role = roleIdx !== -1 && args[roleIdx + 1]
    ? args[roleIdx + 1]
    : 'solver';
  if (!SUPPORTED_ROLES.includes(role)) {
    console.error(`❌ 不支持的角色: ${role}，可选值: ${SUPPORTED_ROLES.join(', ')}`);
    process.exit(1);
  }
  return { role };
}

// ── 配置解析（复用 test-llm.mjs 的回退逻辑） ─────────

function resolveRoleConfig(role) {
  // solver 直接用 LLM_*（与 agent-core resolveProviderConfig 一致）
  const provider = process.env.LLM_PROVIDER ?? 'openai';
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const apiKey = process.env.LLM_API_KEY ?? '';
  const baseUrl = process.env.LLM_BASE_URL ?? '';
  const timeout = process.env.LLM_TIMEOUT_MS
    ? parseInt(process.env.LLM_TIMEOUT_MS, 10)
    : STREAM_TIMEOUT_MS;
  // 默认值须与 packages/agent-core/src/constants/defaults.ts 的
  // ROLE_DEFAULTS.solver.temperature 保持一致（当前为 0.3）。
  // 当 .env 未设置 LLM_TEMPERATURE 时，探针和生产代码用相同 temperature
  // 调用模型，否则探针结果无法反映真实生产环境。
  const temperature = process.env.LLM_TEMPERATURE
    ? parseFloat(process.env.LLM_TEMPERATURE)
    : 0.3;

  return { provider, model, apiKey, baseUrl, timeout, temperature };
}

// ── 脱敏工具 ──────────────────────────────────────────

/** 脱敏 API key：只显示前 6 位和后 4 位 */
function maskKey(key) {
  if (!key) return '(未设置)';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/** 脱敏 base URL：只显示 origin，隐藏 path/query */
function maskOrigin(url) {
  if (!url) return '(默认)';
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return '(无效 URL)';
  }
}

// ── ChatModel 创建（复用 test-llm.mjs，加 streamUsage: false） ──

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
        // 与 agent-core model-factory 保持一致：关闭 streamUsage 避免 stream_options
        streamUsage: false,
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
      return null;
    }
    default: {
      console.error(`   不支持的 provider: ${cfg.provider}，可选值: openai, gemini, anthropic`);
      return null;
    }
  }
}

// ── 流式探针主流程 ────────────────────────────────────

/**
 * 提取 chunk 的文本 content 长度（不记录正文内容）
 *
 * LangChain AIMessageChunk 的 content 可能是 string 或数组（多模态）。
 * 这里只统计字符数，用于判断 chunk 是否非空。
 */
function extractContentLength(chunk) {
  const content = chunk?.content;
  if (typeof content === 'string') {
    return content.length;
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (typeof part === 'string') return sum + part.length;
      if (part && typeof part === 'object' && typeof part.text === 'string') {
        return sum + part.text.length;
      }
      return sum;
    }, 0);
  }
  return 0;
}

/**
 * 提取 finish_reason（兼容不同 provider 的字段位置）
 */
function extractFinishReason(chunk) {
  // LangChain 标准字段
  if (chunk?.response_metadata?.finish_reason) {
    return chunk.response_metadata.finish_reason;
  }
  // additional_kwargs（部分版本放在这里）
  if (chunk?.additional_kwargs?.finish_reason) {
    return chunk.additional_kwargs.finish_reason;
  }
  // additional_kwargs.response_metadata（另一种布局）
  if (chunk?.additional_kwargs?.response_metadata?.finish_reason) {
    return chunk.additional_kwargs.response_metadata.finish_reason;
  }
  return null;
}

/**
 * 运行流式探针
 *
 * 统计：first-token latency、total latency、非空 content chunk 数、
 * finish reason、总文本字符数。不打印正文。
 */
async function runStreamProbe(chatModel) {
  const start = Date.now();
  let firstTokenLatency = null;
  let nonEmptyChunkCount = 0;
  let totalContentLength = 0;
  let finishReason = null;
  let timedOut = false;

  try {
    const stream = await chatModel.stream([new HumanMessage(PROBE_PROMPT)]);

    for await (const chunk of stream) {
      // 整体超时保护：ChatOpenAI 的 timeout 只覆盖单次 HTTP 请求建立，
      // 不保护整个流式迭代。若上游 SSE 建立后无限慢速发 chunk，
      // for await 会无限阻塞导致探针挂死。这里在循环内累计检查
      // 已用时间，超过 STREAM_TIMEOUT_MS 就 break。
      // 不用 AbortController（避免与后续 runAbortTest 的 abort 语义混淆）。
      const now = Date.now();
      if (now - start > STREAM_TIMEOUT_MS) {
        timedOut = true;
        break;
      }

      const contentLen = extractContentLength(chunk);

      // 第一个非空 content chunk 记录 first-token latency
      if (contentLen > 0 && firstTokenLatency === null) {
        firstTokenLatency = Date.now() - start;
      }

      if (contentLen > 0) {
        nonEmptyChunkCount += 1;
        totalContentLength += contentLen;
      }

      // finish reason 可能在任意 chunk 的 response_metadata 里（通常是最后一个）
      const reason = extractFinishReason(chunk);
      if (reason) {
        finishReason = reason;
      }
    }
  } catch (error) {
    const elapsed = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      elapsed,
      firstTokenLatency,
      nonEmptyChunkCount,
      totalContentLength,
      finishReason,
      error: message,
    };
  }

  const elapsed = Date.now() - start;
  if (timedOut) {
    // 超时不算成功，给主流程明确的 timeout 标记让其打印
    // "stream probe timed out after Nms" 而不是假装成功。
    return {
      ok: false,
      timeout: true,
      elapsed,
      firstTokenLatency,
      nonEmptyChunkCount,
      totalContentLength,
      finishReason,
      error: `stream probe timed out after ${elapsed}ms`,
    };
  }
  return {
    ok: true,
    elapsed,
    firstTokenLatency,
    nonEmptyChunkCount,
    totalContentLength,
    finishReason,
  };
}

/**
 * AbortSignal 取消测试
 *
 * 启动流后立即 abort，验证迭代器在超时预算内停止。
 * 返回 `{ stoppedWithinBudget, elapsed }`：
 *   - `stoppedWithinBudget`：是否在 ABORT_TEST_TIMEOUT_MS 内停止（含正常结束与 abort 抛错两种情况）
 *   - `elapsed`：实际停止耗时（ms）
 */
async function runAbortTest(chatModel) {
  const controller = new AbortController();
  const start = Date.now();

  let stoppedWithinBudget = false;

  try {
    // 注意：stream 的 options 通过第二个参数传入，signal 在其中
    const stream = await chatModel.stream(
      [new HumanMessage('你好')],
      { signal: controller.signal },
    );

    // 立即触发取消
    controller.abort();

    for await (const _chunk of stream) {
      // 收到 chunk 也无所谓，关键是看迭代器是否会在 abort 后停止
      const elapsed = Date.now() - start;
      if (elapsed > ABORT_TEST_TIMEOUT_MS) {
        return { stoppedWithinBudget: false, elapsed };
      }
    }

    stoppedWithinBudget = (Date.now() - start) <= ABORT_TEST_TIMEOUT_MS;
  } catch (error) {
    // abort 后抛错是正常行为（AbortError）
    stoppedWithinBudget = (Date.now() - start) <= ABORT_TEST_TIMEOUT_MS;
  }

  return { stoppedWithinBudget, elapsed: Date.now() - start };
}

// ── 单角色测试 ────────────────────────────────────────

async function testRole(role) {
  const cfg = resolveRoleConfig(role);

  console.log(`  Provider:    ${cfg.provider}`);
  console.log(`  Model:       ${cfg.model}`);
  console.log(`  Origin:      ${maskOrigin(cfg.baseUrl)}`);
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

  // ── 流式探针 ──
  console.log('\n  ── 流式探针 ──');
  const probe = await runStreamProbe(chatModel);

  if (!probe.ok) {
    console.log(`  ❌ 流式探针失败！耗时 ${probe.elapsed}ms`);
    console.log(`  错误: ${probe.error}\n`);
    return { role, ok: false, reason: probe.error };
  }

  console.log(`  first-token latency: ${probe.firstTokenLatency ?? '(无)'}ms`);
  console.log(`  total latency:       ${probe.elapsed}ms`);
  console.log(`  非空 content chunks: ${probe.nonEmptyChunkCount}`);
  console.log(`  总文本字符数:        ${probe.totalContentLength}`);
  console.log(`  finish reason:       ${probe.finishReason ?? '(无)'}`);

  // ── AbortSignal 取消测试 ──
  console.log('\n  ── AbortSignal 取消测试 ──');
  const abortResult = await runAbortTest(chatModel);
  console.log(`  abort test: stopped within ${abortResult.elapsed}ms (budget ${ABORT_TEST_TIMEOUT_MS}ms)`);

  // ── 通过条件判定 ──
  const conditions = {
    'chunks >= 2': probe.nonEmptyChunkCount >= 2,
    'finish reason 有效': probe.finishReason !== null && probe.finishReason !== '',
    '总文本非空': probe.totalContentLength > 0,
    '取消在预算内停止': abortResult.stoppedWithinBudget,
  };

  console.log('\n  ── 通过条件 ──');
  let allPassed = true;
  for (const [name, passed] of Object.entries(conditions)) {
    console.log(`  ${passed ? '✅' : '❌'} ${name}`);
    if (!passed) allPassed = false;
  }

  console.log('');
  return { role, ok: allPassed, probe, abortResult };
}

// ── 主流程 ────────────────────────────────────────────

async function main() {
  const { role } = parseArgs();

  console.log('=== LLM 流式能力探针 ===\n');

  console.log(`── ${role.toUpperCase()} ──`);
  const result = await testRole(role);

  console.log('── 汇总 ──');
  console.log(`  ${result.ok ? '✅ 通过' : '❌ 未通过'}: ${result.role}`);
  if (!result.ok && result.reason) {
    console.log(`  原因: ${result.reason}`);
  }

  process.exit(result.ok ? 0 : 1);
}

main();
