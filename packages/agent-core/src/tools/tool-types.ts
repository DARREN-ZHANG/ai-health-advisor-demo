import { z } from 'zod';
import type { TaskContextPacket } from '../context/context-packet';
import type { AgentContext } from '../types/agent-context';
import type { KnowledgeRepository } from '../knowledge/types';

/** 工具执行上下文 */
export interface ToolExecutionContext {
  packet: TaskContextPacket;
  context: AgentContext;
  knowledgeRepository?: KnowledgeRepository;
}

/** 工具执行结果 */
export type ToolResult<T> =
  | { success: true; data: T; evidenceIds: string[] }
  | { success: false; error: ToolError };

/** 工具错误 */
export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** 工具定义 */
export interface ToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolResult<TOutput>>;
}

/** ReAct 步骤记录 */
export interface ReActStep {
  stepNumber: number;
  toolName: string;
  input: unknown;
  output: ToolResult<unknown>;
  timestamp: string;
}
