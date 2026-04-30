import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '@health-advisor/shared';

export type PromptName = 'system' | 'homepage' | 'view-summary' | 'advisor-chat';

const PROMPT_NAMES: PromptName[] = ['system', 'homepage', 'view-summary', 'advisor-chat'];

export interface PromptLoader {
  load(name: PromptName): string;
  loadStyle(name: Exclude<PromptName, 'system'>, locale: Locale): string;
  listAvailable(): PromptName[];
}

export interface PromptLoaderDeps {
  readFileSync: (path: string, encoding?: string) => string;
  existsSync: (path: string) => boolean;
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
  const exister = deps?.existsSync ?? existsSync;
  const cache = new Map<string, string>();

  function readCached(filePath: string): string {
    const cached = cache.get(filePath);
    if (cached !== undefined) return cached;

    const content = reader(filePath, 'utf-8');
    cache.set(filePath, content);
    return content;
  }

  return {
    load(name: PromptName): string {
      if (!PROMPT_NAMES.includes(name)) {
        throw new Error(`Unknown prompt name: ${name}`);
      }

      // system 始终读 system.md
      if (name === 'system') {
        const filePath = join(dir, 'system.md');
        return readCached(filePath);
      }

      // 非系统 prompt：优先读 {name}/template.md，不存在则回退读 {name}.md
      const templatePath = join(dir, name, 'template.md');
      if (exister(templatePath)) {
        return readCached(templatePath);
      }

      const flatPath = join(dir, `${name}.md`);
      return readCached(flatPath);
    },

    loadStyle(name: Exclude<PromptName, 'system'>, locale: Locale): string {
      const stylePath = join(dir, name, 'style', `${locale}.md`);
      return readCached(stylePath);
    },

    listAvailable(): PromptName[] {
      return [...PROMPT_NAMES];
    },
  };
}
