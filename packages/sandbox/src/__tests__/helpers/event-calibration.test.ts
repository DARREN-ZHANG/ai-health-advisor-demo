import { describe, it, expect } from 'vitest';
import {
  fitIsotonicRegression,
  selectOperatingPoint,
  calibrateProbability,
  findLikelyThreshold,
  evaluateThreshold,
  type CalibrationPoint,
  type EventCalibrationConfig,
} from '../../helpers/event-calibration';
// 直接导入 artifact 测试不变量
import artifact from '../../calibration/event-recognition.json';

// 所有 sensor-inferred 事件类型必须有校准配置
const REQUIRED_CALIBRATION_TYPES = [
  'meal_intake',
  'steady_cardio',
  'prolonged_sedentary',
  'intermittent_exercise',
  'walk',
  'sleep',
  'strength_training',
  'possible_caffeine_intake',
  'possible_alcohol_intake',
] as const;

// ============================================================
// 校准纯函数单元测试
// ============================================================

describe('event-calibration 纯函数', () => {
  // ----------------------------------------------------------
  // fitIsotonicRegression (PAVA)
  // ----------------------------------------------------------
  describe('fitIsotonicRegression (PAVA)', () => {
    it('空输入应返回空 bucket 数组', () => {
      const buckets = fitIsotonicRegression([]);
      expect(buckets).toEqual([]);
    });

    it('单个样本应返回单个 bucket', () => {
      const points: CalibrationPoint[] = [{ rawScore: 0.5, label: 1 }];
      const buckets = fitIsotonicRegression(points);
      expect(buckets).toHaveLength(1);
      expect(buckets[0]!.minRawScore).toBe(0.5);
      expect(buckets[0]!.probability).toBe(1);
    });

    it('应产生单调非递减的概率序列', () => {
      // 构造带噪声的 (rawScore, label) 对
      const points: CalibrationPoint[] = [
        { rawScore: 0.1, label: 0 },
        { rawScore: 0.2, label: 1 },
        { rawScore: 0.3, label: 0 },
        { rawScore: 0.4, label: 1 },
        { rawScore: 0.5, label: 0 },
        { rawScore: 0.6, label: 1 },
        { rawScore: 0.7, label: 1 },
        { rawScore: 0.8, label: 1 },
        { rawScore: 0.9, label: 1 },
      ];
      const buckets = fitIsotonicRegression(points);

      // 概率应单调非递减
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]!.probability).toBeGreaterThanOrEqual(buckets[i - 1]!.probability);
      }
      // rawScore 边界应严格递增
      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i]!.minRawScore).toBeGreaterThan(buckets[i - 1]!.minRawScore);
      }
    });

    it('应处理违反单调性的相邻样本（PAVA 合并）', () => {
      // rawScore=0.5 label=1, rawScore=0.6 label=0 —— 违反单调性
      // PAVA 应将这两个点合并为一个 bucket，概率为 0.5
      const points: CalibrationPoint[] = [
        { rawScore: 0.5, label: 1 },
        { rawScore: 0.6, label: 0 },
      ];
      const buckets = fitIsotonicRegression(points);
      expect(buckets).toHaveLength(1);
      expect(buckets[0]!.probability).toBeCloseTo(0.5, 5);
    });

    it('低分应映射到低概率，高分应映射到高概率', () => {
      // 构造完美可分的样本
      const points: CalibrationPoint[] = [
        ...Array.from({ length: 10 }, (_, i) => ({ rawScore: 0.1 + i * 0.01, label: 0 as const })),
        ...Array.from({ length: 10 }, (_, i) => ({ rawScore: 0.7 + i * 0.01, label: 1 as const })),
      ];
      const buckets = fitIsotonicRegression(points);
      // 第一个 bucket 概率应为 0
      expect(buckets[0]!.probability).toBeCloseTo(0, 5);
      // 最后一个 bucket 概率应为 1
      expect(buckets[buckets.length - 1]!.probability).toBeCloseTo(1, 5);
    });

    it('相同 rawScore 的样本应被聚合到同一 bucket', () => {
      const points: CalibrationPoint[] = [
        { rawScore: 0.5, label: 1 },
        { rawScore: 0.5, label: 0 },
        { rawScore: 0.5, label: 1 },
      ];
      const buckets = fitIsotonicRegression(points);
      // 三个相同 rawScore 的样本应聚合为 1 个 bucket，概率 = 2/3
      expect(buckets).toHaveLength(1);
      expect(buckets[0]!.probability).toBeCloseTo(2 / 3, 5);
    });
  });

  // ----------------------------------------------------------
  // evaluateThreshold
  // ----------------------------------------------------------
  describe('evaluateThreshold', () => {
    it('应在完美可分数据上达到 precision=1, recall=1', () => {
      const points: CalibrationPoint[] = [
        { rawScore: 0.1, label: 0 },
        { rawScore: 0.2, label: 0 },
        { rawScore: 0.8, label: 1 },
        { rawScore: 0.9, label: 1 },
      ];
      const result = evaluateThreshold(points, 0.5);
      expect(result.precision).toBeCloseTo(1, 5);
      expect(result.recall).toBeCloseTo(1, 5);
    });

    it('空正例集应返回 precision=0, recall=0', () => {
      const points: CalibrationPoint[] = [
        { rawScore: 0.1, label: 0 },
        { rawScore: 0.2, label: 0 },
      ];
      const result = evaluateThreshold(points, 0.05);
      expect(result.precision).toBe(0);
      expect(result.recall).toBe(0);
    });

    it('阈值越高，recall 越低（单调）', () => {
      const points: CalibrationPoint[] = Array.from({ length: 20 }, (_, i) => ({
        rawScore: i / 20,
        label: (i >= 10 ? 1 : 0) as 0 | 1,
      }));
      const r1 = evaluateThreshold(points, 0.4);
      const r2 = evaluateThreshold(points, 0.7);
      expect(r2.recall).toBeLessThanOrEqual(r1.recall);
    });
  });

  // ----------------------------------------------------------
  // selectOperatingPoint
  // ----------------------------------------------------------
  describe('selectOperatingPoint', () => {
    it('应在满足 precision>=0.95 的前提下选择 recall 最高的阈值', () => {
      // 完美可分数据：任何 0.2~0.8 之间的阈值都满足 precision=1
      const points: CalibrationPoint[] = [
        ...Array.from({ length: 5 }, (_, i) => ({ rawScore: 0.1 + i * 0.02, label: 0 as const })),
        ...Array.from({ length: 5 }, (_, i) => ({ rawScore: 0.8 + i * 0.02, label: 1 as const })),
      ];
      const op = selectOperatingPoint(points, 0.95);
      expect(op.publishable).toBe(true);
      expect(op.publishThreshold).toBeGreaterThan(0);
      expect(op.validationPrecision).toBeGreaterThanOrEqual(0.95);
      expect(op.validationRecall).toBeCloseTo(1, 5);
    });

    it('当无法满足 precision>=0.95 时应返回 publishable=false', () => {
      // 高噪声数据：低分和高分都有正负例混杂
      const points: CalibrationPoint[] = Array.from({ length: 50 }, (_, i) => ({
        rawScore: i / 50,
        // 50% 随机标签，任何阈值都无法达到 0.95 precision
        label: (i % 2 === 0 ? 1 : 0) as 0 | 1,
      }));
      const op = selectOperatingPoint(points, 0.95);
      expect(op.publishable).toBe(false);
    });

    it('publishThreshold 应落在合法范围 [0,1]', () => {
      const points: CalibrationPoint[] = [
        { rawScore: 0.3, label: 0 },
        { rawScore: 0.4, label: 0 },
        { rawScore: 0.7, label: 1 },
        { rawScore: 0.8, label: 1 },
      ];
      const op = selectOperatingPoint(points, 0.95);
      expect(op.publishThreshold).toBeGreaterThanOrEqual(0);
      expect(op.publishThreshold).toBeLessThanOrEqual(1);
    });
  });

  // ----------------------------------------------------------
  // findLikelyThreshold
  // ----------------------------------------------------------
  describe('findLikelyThreshold', () => {
    it('应在 bucket 序列上插值找到 probability=0.8 对应的 rawScore', () => {
      const buckets = [
        { minRawScore: 0.0, probability: 0.0 },
        { minRawScore: 0.4, probability: 0.5 },
        { minRawScore: 0.7, probability: 0.9 },
      ];
      const t = findLikelyThreshold(buckets, 0.8);
      // 0.8 在 [0.5, 0.9] 之间，对应 rawScore 应在 [0.4, 0.7] 之间
      expect(t).toBeGreaterThan(0.4);
      expect(t).toBeLessThan(0.7);
    });

    it('所有 bucket 概率均低于目标时应返回最大 rawScore', () => {
      const buckets = [
        { minRawScore: 0.0, probability: 0.1 },
        { minRawScore: 0.5, probability: 0.3 },
      ];
      const t = findLikelyThreshold(buckets, 0.8);
      // 无法达到 0.8 → 返回最大 bucket 边界
      expect(t).toBeGreaterThanOrEqual(0.5);
    });

    it('所有 bucket 概率均高于目标时应返回最小 rawScore', () => {
      const buckets = [
        { minRawScore: 0.2, probability: 0.9 },
        { minRawScore: 0.5, probability: 1.0 },
      ];
      const t = findLikelyThreshold(buckets, 0.8);
      expect(t).toBeLessThanOrEqual(0.2);
    });

    it('空 bucket 序列应返回 0', () => {
      expect(findLikelyThreshold([], 0.8)).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // calibrateProbability
  // ----------------------------------------------------------
  describe('calibrateProbability', () => {
    const config: EventCalibrationConfig = {
      eventType: 'meal_intake',
      publishable: true,
      publishThreshold: 0.65,
      likelyThreshold: 0.72,
      isotonicBuckets: [
        { minRawScore: 0.0, probability: 0.1 },
        { minRawScore: 0.5, probability: 0.4 },
        { minRawScore: 0.7, probability: 0.85 },
        { minRawScore: 0.9, probability: 0.95 },
      ],
      validationPrecision: 0.96,
      validationRecall: 0.88,
    };

    it('应将 raw score 映射到 bucket 概率（单调）', () => {
      // raw score 越高，calibrated probability 越高
      const low = calibrateProbability(0.1, config);
      const mid = calibrateProbability(0.6, config);
      const high = calibrateProbability(0.95, config);
      expect(low).toBeLessThan(mid);
      expect(mid).toBeLessThan(high);
    });

    it('raw score 低于第一个 bucket 边界时应返回第一个 bucket 概率', () => {
      const p = calibrateProbability(-0.5, config);
      expect(p).toBeCloseTo(0.1, 5);
    });

    it('raw score 高于最后一个 bucket 边界时应返回最后一个 bucket 概率', () => {
      const p = calibrateProbability(2.0, config);
      expect(p).toBeCloseTo(0.95, 5);
    });

    it('空 bucket 序列应返回 0', () => {
      const emptyConfig: EventCalibrationConfig = {
        ...config,
        isotonicBuckets: [],
      };
      expect(calibrateProbability(0.5, emptyConfig)).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // 集成：fitIsotonicRegression + selectOperatingPoint
  // ----------------------------------------------------------
  describe('集成：PAVA + operating point', () => {
    it('应生成合法的 EventCalibrationConfig 结构', () => {
      const points: CalibrationPoint[] = [
        ...Array.from({ length: 30 }, (_, i) => ({ rawScore: 0.1 + i * 0.01, label: 0 as const })),
        ...Array.from({ length: 30 }, (_, i) => ({ rawScore: 0.6 + i * 0.01, label: 1 as const })),
      ];
      const buckets = fitIsotonicRegression(points);
      const op = selectOperatingPoint(points, 0.95);
      const likely = findLikelyThreshold(buckets, 0.8);

      const config: EventCalibrationConfig = {
        eventType: 'meal_intake',
        publishable: op.publishable,
        publishThreshold: op.publishThreshold,
        likelyThreshold: likely,
        isotonicBuckets: buckets,
        validationPrecision: op.validationPrecision,
        validationRecall: op.validationRecall,
      };

      // 结构断言
      expect(config.eventType).toBe('meal_intake');
      expect(Array.isArray(config.isotonicBuckets)).toBe(true);
      expect(config.isotonicBuckets.length).toBeGreaterThan(0);
      expect(config.publishThreshold).toBeGreaterThanOrEqual(0);
      expect(config.publishThreshold).toBeLessThanOrEqual(1);
      expect(config.likelyThreshold).toBeGreaterThanOrEqual(0);
      expect(config.likelyThreshold).toBeLessThanOrEqual(1);

      // 单调性断言
      for (let i = 1; i < config.isotonicBuckets.length; i++) {
        expect(config.isotonicBuckets[i]!.probability).toBeGreaterThanOrEqual(
          config.isotonicBuckets[i - 1]!.probability,
        );
      }
    });
  });
});

// ============================================================
// 校准 artifact 不变量测试
// ============================================================

describe('event-recognition.json artifact 不变量', () => {
  const configs = artifact as EventCalibrationConfig[];

  it('应包含所有 sensor-inferred 事件类型的配置', () => {
    const types = new Set(configs.map((c) => c.eventType));
    for (const t of REQUIRED_CALIBRATION_TYPES) {
      expect(types.has(t)).toBe(true);
    }
  });

  it('每个配置的 isotonicBuckets 概率应单调非递减', () => {
    for (const cfg of configs) {
      for (let i = 1; i < cfg.isotonicBuckets.length; i++) {
        expect(cfg.isotonicBuckets[i]!.probability).toBeGreaterThanOrEqual(
          cfg.isotonicBuckets[i - 1]!.probability,
        );
      }
    }
  });

  it('每个配置的 isotonicBuckets minRawScore 应严格递增', () => {
    for (const cfg of configs) {
      for (let i = 1; i < cfg.isotonicBuckets.length; i++) {
        expect(cfg.isotonicBuckets[i]!.minRawScore).toBeGreaterThan(
          cfg.isotonicBuckets[i - 1]!.minRawScore,
        );
      }
    }
  });

  it('publishThreshold 和 likelyThreshold 应在 [0, 1] 范围内', () => {
    for (const cfg of configs) {
      expect(cfg.publishThreshold).toBeGreaterThanOrEqual(0);
      expect(cfg.publishThreshold).toBeLessThanOrEqual(1);
      expect(cfg.likelyThreshold).toBeGreaterThanOrEqual(0);
      expect(cfg.likelyThreshold).toBeLessThanOrEqual(1);
    }
  });

  it('publishable=true 的配置 validationPrecision 应 >= 0.95', () => {
    for (const cfg of configs) {
      if (cfg.publishable) {
        expect(cfg.validationPrecision).toBeGreaterThanOrEqual(0.95);
      }
    }
  });

  it('publishable=false 的配置 publishThreshold 应为 1（保守）', () => {
    for (const cfg of configs) {
      if (!cfg.publishable) {
        expect(cfg.publishThreshold).toBe(1);
      }
    }
  });
});
