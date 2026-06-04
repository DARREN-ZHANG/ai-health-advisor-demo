import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const promptPath = resolve(import.meta.dirname, '../../../../../data/sandbox/prompts/advisor-plan.md');

describe('advisor planner prompt web search rules', () => {
  it('documents the webSearchNeeds schema and explicit trigger boundary', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('"webSearchNeeds"');
    expect(prompt).toContain('"query"');
    expect(prompt).toContain('"required"');
    expect(prompt).toContain('用户问题需要外部最新信息时，必须输出 webSearchNeeds');
    expect(prompt).toContain('用户只询问自己的睡眠、HRV、压力、活动、SpO2、静息心率等本地数据时，不输出 webSearchNeeds');
    expect(prompt).toContain('本地编译知识或产品 facts 能回答时，优先使用本地知识，不搜索');
    expect(prompt).toContain('不要用关键词启发式触发搜索');
    expect(prompt).toContain('当用户查询明确需要外部信息');
  });

  it('documents safety limits for diagnosis and medication questions', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('对诊断、用药、治疗问题');
    expect(prompt).toContain('只能用于一般性背景说明');
    expect(prompt).toContain('不能支持个性化医疗指令');
  });
});
