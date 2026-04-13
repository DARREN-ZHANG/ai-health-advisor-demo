import { describe, it, expect } from 'vitest';
import { createPromptLoader, type PromptLoader } from '../../prompts/prompt-loader';

// 模拟 fs 读取
const mockTemplates: Record<string, string> = {
  system: '你是一位健康顾问',
  homepage: '请生成首页摘要',
  'view-summary': '请生成视图总结',
  'advisor-chat': '请进行健康对话',
};

function makeLoader(templates: Record<string, string> = mockTemplates): PromptLoader {
  return createPromptLoader({
    readFileSync: (path: string) => {
      const name = path.split('/').pop()?.replace('.md', '') ?? '';
      const content = templates[name];
      if (!content) throw new Error(`文件不存在: ${path}`);
      return content;
    },
  } as never);
}

describe('createPromptLoader', () => {
  it('加载 system prompt', () => {
    const loader = makeLoader();
    const prompt = loader.load('system');
    expect(prompt).toBe('你是一位健康顾问');
  });

  it('加载 homepage prompt', () => {
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

  it('缓存已加载的 prompt', () => {
    const readCalls: string[] = [];
    const loader = createPromptLoader({
      readFileSync: (path: string) => {
        readCalls.push(path);
        return mockTemplates[path.split('/').pop()?.replace('.md', '') ?? ''] ?? '';
      },
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
});
