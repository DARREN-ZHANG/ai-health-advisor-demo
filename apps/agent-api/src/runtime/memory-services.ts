import {
  InMemoryDurableMemoryStore,
  type DurableMemoryStore,
  type MemoryCandidateStore,
} from '@health-advisor/agent-core';
import { createSupabaseSql } from '../persistence/supabase/client.js';
import { SupabaseMemoryStore } from '../persistence/supabase/memory-store.js';

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
}

export function createMemoryServices(config: MemoryServicesConfig): MemoryServices {
  if (config.MEMORY_BACKEND === 'supabase') {
    if (!config.SUPABASE_DB_URL) {
      throw new Error('SUPABASE_DB_URL is required when MEMORY_BACKEND is supabase');
    }
    const store = new SupabaseMemoryStore(createSupabaseSql(config.SUPABASE_DB_URL));
    return {
      userScopeId: config.DEMO_USER_SCOPE_ID,
      candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
      candidates: store,
      durable: store,
    };
  }

  const store = new InMemoryDurableMemoryStore();
  return {
    userScopeId: config.DEMO_USER_SCOPE_ID,
    candidateTtlMs: config.MEMORY_CANDIDATE_TTL_HOURS * 60 * 60 * 1000,
    candidates: store,
    durable: store,
  };
}
