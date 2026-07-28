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

describe('advisor planner prompt — UI 控制计划', () => {
  it('documents control_ui action and clientAction schema', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('control_ui');
    expect(prompt).toContain('homepage.trend-card.set');
    expect(prompt).toContain('clientAction');
    expect(prompt).toContain(
      '"action": "<status_summary|explain_chart|ask_why|exercise_readiness|compare_periods|create_plan|general|control_ui>"',
    );
    expect(prompt).toContain('"display": "<hidden|sleep|activity>"');
    expect(prompt).toContain('当前客户端 UI 状态');
  });

  it('provides positive examples for sleep/activity/hidden control', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('在首页展示睡眠趋势简报');
    expect(prompt).toContain('在首页展示活动趋势简报');
    expect(prompt).toContain('隐藏首页趋势简报');
  });

  it('documents sleep-to-activity replacement as an activity target transition', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('homepageTrendCard: sleep');
    expect(prompt).toContain('把 Sleep 模块替换成 Activity 模块');
    expect(prompt).toContain('display:"activity"');
    expect(prompt).toContain('`display` 必须取用户指定的**目标模块**');
    expect(prompt).toContain('不能保留当前值');
  });

  it('explicitly rejects keyword-based triggering for normal health questions', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('不要基于单个关键词（如"睡眠"或"活动"）直接判定为 control_ui');
  });

  it('documents clarification boundary for ambiguous display requests', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('显示趋势简报');
    expect(prompt).toContain('clarificationQuestion');
  });
});

describe('advisor planner prompt — 结构化计划意图', () => {
  it('把明确的睡眠改善计划请求分类为 create_plan，而不是数据分析', () => {
    const prompt = readFileSync(promptPath, 'utf-8');

    expect(prompt).toContain('创建或调整可执行健康计划（`create_plan`）');
    expect(prompt).toContain('can you help me out with a sleep improvement plan?');
    expect(prompt).toContain('不得把计划创建请求分类成 `status_summary`、`explain_chart` 或 `general`');
    expect(prompt).toContain('`answerShape.includeChartTokens` 必须为 `false`');
    expect(prompt).toContain('最近对话表明用户正在调整已有计划时');
    expect(prompt).toContain('不得基于单个关键词启发式判断');
  });
});
