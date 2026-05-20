import {
  InMemoryDurableMemoryStore,
  InMemoryAgentCacheStore,
  InMemoryWorkflowStateStore,
  type DurableMemoryStore,
  type MemoryCandidateStore,
  type MemoryExtractionService,
  type AgentCacheStore,
  type WorkflowStateStore,
} from '@health-advisor/agent-core';
import { createSupabaseSql } from '../persistence/supabase/client.js';
import { SupabaseMemoryStore } from '../persistence/supabase/memory-store.js';
import { SupabaseAgentCacheStore } from '../persistence/supabase/cache-store.js';
import { SupabaseWorkflowStateStore } from '../persistence/supabase/workflow-store.js';

export interface MemoryServicesConfig {
  MEMORY_BACKEND: 'memory' | 'supabase';
  SUPABASE_DB_URL?: string;
  MEMORY_CANDIDATE_TTL_HOURS: number;
  DEMO_USER_SCOPE_ID: string;
}

export interface MemoryServices {
  userScopeId: string;
  candidateTtlMs: number;
  candidates: MemoryCandidateStore;
  durable: DurableMemoryStore;
  cache: AgentCacheStore;
  workflow: WorkflowStateStore;
  extractor?: MemoryExtractionService;
}

export function createMemoryServices(config: MemoryServicesConfig): MemoryServices {
  if (config.MEMORY_BACKEND === 'supabase') {
    if (!config.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is required when MEMORY_BACKEND is supabase');
    }
    const sql = createSupabaseSql(config.SUPABASE_DB_URL);
    const memoryStore = new SupabaseMemoryStore(sql);
    return {
      userScopeId: config.DEMO_USER_SCOPE_ID,
      candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
      candidates: memoryStore,
      durable: memoryStore,
      workflow: new SupabaseWorkflowStateStore(sql),
      cache: new SupabaseAgentCacheStore(sql),
    };
  }

  const store = new InMemoryDurableMemoryStore();
  return {
    userScopeId: config.DEMO_USER_SCOPE_ID,
    candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
    candidates: store,
    durable: store,
    workflow: new InMemoryWorkflowStateStore(),
    cache: new InMemoryAgentCacheStore(),
  };
}
