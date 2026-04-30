import { describe, it, expect } from 'vitest';
import { createPromptLoader, type PromptLoader } from '../../prompts/prompt-loader';

// 模拟模板内容
const mockTemplatesByPath: Record<string, string> = {
  'system.md': '你是一位健康顾问',
  'homepage/template.md': '请生成首页摘要',
  'homepage.md': '请生成首页摘要（旧版）',
  'view-summary/template.md': '请生成视图总结',
  'view-summary.md': '请生成视图总结（旧版）',
  'advisor-chat/template.md': '请进行健康对话',
  'advisor-chat.md': '请进行健康对话（旧版）',
  'zh.md': '## Communication Style\n- 语气知性、直截了当\n- You MUST respond entirely in Chinese.',
  'en.md': '## Communication Style\n- Tone: knowledgeable, direct, no fluff\n- You MUST respond entirely in English.',
};

// 子目录结构存在的 prompt name
const subDirTemplates = new Set(['homepage', 'view-summary', 'advisor-chat']);

function makeLoader(templates = mockTemplatesByPath): PromptLoader {
  return createPromptLoader({
    readFileSync: (path: string) => {
      // 从路径提取相对文件名，如 /path/to/homepage/template.md -> homepage/template.md
      const parts = path.split('/');
      const relativeParts = parts.slice(-2).join('/');
      const content = templates[relativeParts] ?? templates[parts[parts.length - 1]];
      if (!content) throw new Error(`文件不存在: ${path}`);
      return content;
    },
    existsSync: (path: string) => {
      // 检测子目录结构是否存在：如 /path/to/homepage/template.md -> homepage 子目录存在
      const parts = path.split('/');
      const parentDir = parts[parts.length - 2];
      return subDirTemplates.has(parentDir ?? '');
    },
  } as never);
}

describe('createPromptLoader', () => {
  it('加载 system prompt', () => {
    const loader = makeLoader();
    const prompt = loader.load('system');
    expect(prompt).toBe('你是一位健康顾问');
  });

  it('加载 homepage prompt（优先子目录 template.md）', () => {
    const loader = makeLoader();
    const prompt = loader.load('homepage');
    expect(prompt).toContain('首页摘要');
  });

  it('加载 view-summary prompt', () => {
    const loader = makeLoader();
    const prompt = loader.load('view-summary');
    expect(prompt).toContain('视图总结');
  });

  it('加载 advisor-chat prompt', () => {
    const loader = makeLoader();
    const prompt = loader.load('advisor-chat');
    expect(prompt).toContain('健康对话');
  });

  it('不存在的 prompt 名抛错', () => {
    const loader = makeLoader();
    expect(() => loader.load('nonexistent' as never)).toThrow();
  });

  it('缓存已加载的 prompt（使用文件路径作为 key）', () => {
    const readCalls: string[] = [];
    const loader = createPromptLoader({
      readFileSync: (path: string) => {
        readCalls.push(path);
        const parts = path.split('/');
        const relativeParts = parts.slice(-2).join('/');
        return mockTemplatesByPath[relativeParts] ?? mockTemplatesByPath[parts[parts.length - 1]] ?? '';
      },
      existsSync: () => false,
    } as never);

    loader.load('system');
    loader.load('system');

    expect(readCalls.length).toBe(1);
  });

  it('listAvailable 返回所有可用模板名', () => {
    const loader = makeLoader();
    const names = loader.listAvailable();
    expect(names).toContain('system');
    expect(names).toContain('homepage');
    expect(names).toContain('view-summary');
    expect(names).toContain('advisor-chat');
  });

  it('loadStyle 加载中文风格模板', () => {
    const loader = makeLoader();
    const style = loader.loadStyle('homepage', 'zh');
    expect(style).toContain('Chinese');
  });

  it('loadStyle 加载英文风格模板', () => {
    const loader = makeLoader();
    const style = loader.loadStyle('homepage', 'en');
    expect(style).toContain('English');
  });

  it('回退到旧版 flat 文件（子目录不存在时）', () => {
    const loader = createPromptLoader({
      readFileSync: (path: string) => {
        const parts = path.split('/');
        const fileName = parts[parts.length - 1];
        const relativeParts = parts.slice(-2).join('/');
        const content = mockTemplatesByPath[relativeParts] ?? mockTemplatesByPath[fileName];
        if (!content) throw new Error(`文件不存在: ${path}`);
        return content;
      },
      existsSync: () => false, // 所有子目录都不存在
    } as never);

    const prompt = loader.load('homepage');
    expect(prompt).toContain('旧版');
  });
});
