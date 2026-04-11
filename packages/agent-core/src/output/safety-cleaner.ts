export interface SafetyFlag {
  type: 'diagnosis' | 'hallucinated_data' | 'unauthorized_advice';
  original: string;
  replacement: string;
}

export interface SafetyCleanResult {
  cleaned: string;
  cleanedTips: string[];
  flags: SafetyFlag[];
}

// 诊断性语言模式
const DIAGNOSIS_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /确诊为/g, replacement: '检测到' },
  { pattern: /患有/g, replacement: '检测到' },
  { pattern: /诊断为/g, replacement: '提示' },
  { pattern: /患了/g, replacement: '出现' },
  { pattern: /被诊断为/g, replacement: '检测到' },
];

// 药物建议模式
const MEDICATION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /建议服用[^。]+药物/g, replacement: '建议及时就医咨询' },
  { pattern: /服药/g, replacement: '就医' },
];

// 缺失指标中文标签
const METRIC_LABELS: Record<string, string> = {
  hr: '心率',
  spo2: '血氧',
  sleep: '睡眠',
  activity: '活动',
  stress: '压力',
};

/**
 * 清洗模型输出中的安全问题：
 * 1. 越权诊断 -> 降级为"检测到/提示"
 * 2. 缺失数据幻觉 -> 标记并替换
 * 3. 非法建议 -> 标记
 */
export function cleanSafetyIssues(
  summary: string,
  missingMetrics: string[],
  microTips: string[] = [],
): SafetyCleanResult {
  const flags: SafetyFlag[] = [];

  // 清洗 summary
  let cleaned = summary;

  // 1. 诊断性语言
  for (const { pattern, replacement } of DIAGNOSIS_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      flags.push({
        type: 'diagnosis',
        original: match[0],
        replacement,
      });
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  // 2. 药物建议
  for (const { pattern, replacement } of MEDICATION_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      flags.push({
        type: 'unauthorized_advice',
        original: match[0],
        replacement,
      });
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  // 3. 缺失数据幻觉 — 替换引用缺失指标具体数值的描述
  if (missingMetrics.length > 0) {
    for (const metric of missingMetrics) {
      const metricPatterns = getMetricPatterns(metric);
      for (const pat of metricPatterns) {
        const match = cleaned.match(pat);
        if (match) {
          flags.push({
            type: 'hallucinated_data',
            original: match[0],
            replacement: `${METRIC_LABELS[metric] ?? metric}数据暂不可用`,
          });
          cleaned = cleaned.replace(pat, `${METRIC_LABELS[metric] ?? metric}数据暂不可用`);
        }
      }
    }
  }

  // 清洗 microTips
  const cleanedTips = microTips.map((tip) => {
    let cleanedTip = tip;
    for (const { pattern, replacement } of DIAGNOSIS_PATTERNS) {
      cleanedTip = cleanedTip.replace(pattern, replacement);
    }
    for (const { pattern, replacement } of MEDICATION_PATTERNS) {
      cleanedTip = cleanedTip.replace(pattern, replacement);
    }
    return cleanedTip;
  });

  return { cleaned, cleanedTips, flags };
}

function getMetricPatterns(metric: string): RegExp[] {
  switch (metric) {
    case 'hr':
      return [/心率.*\d+\s*bpm/g, /HR.*\d+/g];
    case 'spo2':
      return [/血氧.*\d+%/g, /SpO2.*\d+/g];
    case 'sleep':
      return [/睡眠.*\d+\.?\d*\s*小时/g, /睡眠.*\d+\s*分钟/g];
    case 'activity':
      return [/步数.*\d+/g, /运动.*\d+\s*分钟/g];
    case 'stress':
      return [/压力.*\d+/g, /压力负荷.*\d+/g];
    default:
      return [];
  }
}
