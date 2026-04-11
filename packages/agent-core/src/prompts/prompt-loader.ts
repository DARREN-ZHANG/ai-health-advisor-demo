import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PromptName = 'system' | 'homepage' | 'view-summary' | 'advisor-chat';

const PROMPT_NAMES: PromptName[] = ['system', 'homepage', 'view-summary', 'advisor-chat'];

export interface PromptLoader {
  load(name: PromptName): string;
  listAvailable(): PromptName[];
}

export interface PromptLoaderDeps {
  readFileSync: (path: string, encoding?: string) => string;
}

const DEFAULT_PROMPTS_DIR = join(
  process.cwd(),
  'data',
  'sandbox',
  'prompts',
);

export function createPromptLoader(
  deps?: Partial<PromptLoaderDeps>,
  promptsDir?: string,
): PromptLoader {
  const dir = promptsDir ?? DEFAULT_PROMPTS_DIR;
  const reader = deps?.readFileSync ?? readFileSync;
  const cache = new Map<string, string>();

  return {
    load(name: PromptName): string {
      const cached = cache.get(name);
      if (cached !== undefined) return cached;

      if (!PROMPT_NAMES.includes(name)) {
        throw new Error(`Unknown prompt name: ${name}`);
      }

      const filePath = join(dir, `${name}.md`);
      const content = reader(filePath, 'utf-8');
      cache.set(name, content);
      return content;
    },

    listAvailable(): PromptName[] {
      return [...PROMPT_NAMES];
    },
  };
}
