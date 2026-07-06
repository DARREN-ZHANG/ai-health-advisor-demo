import { describe, expect, it } from 'vitest';
import zh from './zh.json';
import en from './en.json';

/**
 * i18n 文案完整性测试（I7.1 Part A）。
 *
 * 守护两条契约：
 * - zh.json 与 en.json 拥有完全一致的 key 集合（防止新增文案时漏译）。
 * - 任何 key 的值都不是空字符串（防止"占位空值"在生产渲染为空白）。
 *
 * 实现刻意保持纯函数 + 不依赖任何 React / next-intl 运行时，
 * 让本测试在最小环境下也能跑起来。
 */

describe('i18n message completeness', () => {
  function collectKeys(obj: unknown, prefix = ''): string[] {
    if (typeof obj !== 'object' || obj === null) return [];
    return Object.entries(obj).flatMap(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null) return collectKeys(v, path);
      return [path];
    });
  }

  it('zh 和 en 拥有完全一致的 key 集合', () => {
    const zhKeys = new Set(collectKeys(zh));
    const enKeys = new Set(collectKeys(en));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    expect({ missingInEn, missingInZh }).toEqual({
      missingInEn: [],
      missingInZh: [],
    });
  });

  it('任何 key 的值都不是空字符串', () => {
    function findEmpty(obj: unknown, prefix = ''): string[] {
      if (typeof obj !== 'object' || obj === null) return [];
      return Object.entries(obj).flatMap(([k, v]) => {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string' && v === '') return [path];
        if (typeof v === 'object') return findEmpty(v, path);
        return [];
      });
    }
    expect({ zh: findEmpty(zh), en: findEmpty(en) }).toEqual({
      zh: [],
      en: [],
    });
  });
});
