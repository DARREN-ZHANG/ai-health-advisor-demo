import { describe, expect, it } from 'vitest';
import { compileKnowledgeMarkdown } from '../compiler';

describe('knowledge compiler', () => {
  it('compiles approved health facts from frontmatter and fact blocks', () => {
    const result = compileKnowledgeMarkdown({
      path: 'knowledge/wiki/health/hrv-basics.md',
      content: `---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv]
intents: [explain_metric]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-12-31
allowedClaims: [explain_relationship]
prohibitedClaims: [diagnosis]
---

# HRV 基础解释

<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。
<!-- fact:end -->
`,
      today: '2026-05-10',
    });

    expect(result.healthFacts).toEqual([
      {
        id: 'health-hrv-general-001',
        layer: 'health_knowledge',
        title: 'HRV 基础解释',
        claim: 'HRV 可以作为恢复状态参考，但不能单独用于诊断疾病。',
        metrics: ['hrv'],
        intents: ['explain_metric'],
        riskLevel: 'general',
        allowedClaims: ['explain_relationship'],
        prohibitedClaims: ['diagnosis'],
        sourceIds: ['source-hrv-001'],
        expiresAt: '2026-12-31',
        evidenceId: 'knowledge_health-hrv-general-001',
      },
    ]);
    expect(result.productFacts).toEqual([]);
  });

  it('rejects expired approved pages', () => {
    expect(() => compileKnowledgeMarkdown({
      path: 'knowledge/wiki/health/hrv-basics.md',
      content: `---
id: health-hrv-basics
title: HRV 基础解释
layer: health_knowledge
metrics: [hrv]
intents: [explain_metric]
riskLevel: general
reviewStatus: approved
sourceIds: [source-hrv-001]
expiresAt: 2026-01-01
allowedClaims: [explain_relationship]
prohibitedClaims: [diagnosis]
---

<!-- fact:start id=health-hrv-general-001 -->
HRV 可以作为恢复状态参考。
<!-- fact:end -->
`,
      today: '2026-05-10',
    })).toThrow(/expired/);
  });

  it('skips non-approved pages', () => {
    const result = compileKnowledgeMarkdown({
      path: 'knowledge/wiki/product/chart-token-guide.md',
      content: `---
id: product-chart-token-guide
title: 图表 token 说明
layer: product_knowledge
productAreas: [chart]
metrics: [sleep]
reviewStatus: draft
sourceIds: [source-product-chart-001]
expiresAt: 2026-12-31
---

<!-- fact:start id=product-sleep-chart-001 -->
SLEEP_7DAYS 展示最近 7 天睡眠总时长趋势。
<!-- fact:end -->
`,
      today: '2026-05-10',
    });

    expect(result.healthFacts).toEqual([]);
    expect(result.productFacts).toEqual([]);
  });
});
