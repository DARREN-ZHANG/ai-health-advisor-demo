/**
 * LLM 连通性测试脚本
 *
 * 用法：node apps/agent-api/src/scripts/test-llm.mjs
 *
 * 从 apps/agent-api/.env 读取配置，向 LLM 发送一条简单消息，
 * 验证 API Key、Base URL、Model 是否正确。
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';

// 加载 agent-api/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const apiKey = process.env.LLM_API_KEY ?? '';
const baseUrl = process.env.LLM_BASE_URL ?? '';
const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
const provider = process.env.LLM_PROVIDER ?? 'openai';
const timeout = process.env.AI_TIMEOUT_MS ? parseInt(process.env.AI_TIMEOUT_MS, 10) : 30000;

console.log('=== LLM 连通性测试 ===\n');
console.log(`Provider:  ${provider}`);
console.log(`Model:     ${model}`);
console.log(`Base URL:  ${baseUrl || '(默认)'}`);
console.log(`API Key:   ${apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : '(未设置)'}`);
console.log(`Timeout:   ${timeout}ms\n`);

if (!apiKey) {
  console.error('❌ LLM_API_KEY 未配置');
  process.exit(1);
}

/** 根据 provider 创建对应的 chat model */
async function createChatModel() {
  switch (provider) {
    case 'openai': {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        modelName: model,
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        temperature: 0,
        maxRetries: 0,
        timeout,
      });
    }
    case 'gemini': {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      return new ChatGoogleGenerativeAI({
        model,
        apiKey,
        temperature: 0,
        maxRetries: 0,
        timeout,
      });
    }
    case 'anthropic': {
      console.error('❌ Anthropic  provider 暂未安装对应依赖包 (@langchain/anthropic)');
      console.error('   请运行: pnpm add -D @langchain/anthropic\n');
      process.exit(1);
    }
    default: {
      console.error(`❌ 不支持的 provider: ${provider}`);
      console.error('   支持的值: openai, gemini, anthropic\n');
      process.exit(1);
    }
  }
}

const start = Date.now();

try {
  const chatModel = await createChatModel();

  console.log('正在发送测试消息...');
  const response = await chatModel.invoke([new HumanMessage('你好，请用一句话回复确认你在线。')]);
  const elapsed = Date.now() - start;

  console.log(`\n✅ 连接成功！耗时 ${elapsed}ms`);
  console.log(`响应内容: ${response.content}\n`);
  process.exit(0);
} catch (error) {
  const elapsed = Date.now() - start;
  const message = error instanceof Error ? error.message : String(error);

  console.error(`\n❌ 连接失败！耗时 ${elapsed}ms`);
  console.error(`错误信息: ${message}\n`);
  process.exit(1);
}
