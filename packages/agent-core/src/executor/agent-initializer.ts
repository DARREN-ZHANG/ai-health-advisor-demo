import type { ResolvedProviderConfig } from '../types/provider';
import { createChatModel } from '../provider/model-factory';
import { createHealthAgent, type HealthAgent } from './create-agent';

export function initializeAgent(providerConfig: ResolvedProviderConfig): HealthAgent {
  const chatModel = createChatModel(providerConfig);
  return createHealthAgent({ chatModel });
}
