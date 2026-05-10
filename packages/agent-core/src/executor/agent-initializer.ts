import type { ResolvedProviderConfig, ResolvedLlmConfig } from '../types/provider';
import { createChatModel, createChatModelForRole } from '../provider/model-factory';
import { createHealthAgent, type HealthAgent } from './create-agent';

/** 向后兼容：从单个 config 创建 solver agent */
export function initializeAgent(providerConfig: ResolvedProviderConfig): HealthAgent {
  const chatModel = createChatModel(providerConfig);
  return createHealthAgent({ chatModel });
}

/** 从多角色配置创建所有 agent */
export function initializeAgents(configs: ResolvedLlmConfig): {
  solverAgent: HealthAgent;
  plannerAgent: HealthAgent;
  reviewerAgent: HealthAgent;
} {
  return {
    solverAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'solver') }),
    plannerAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'planner') }),
    reviewerAgent: createHealthAgent({ chatModel: createChatModelForRole(configs, 'reviewer') }),
  };
}
