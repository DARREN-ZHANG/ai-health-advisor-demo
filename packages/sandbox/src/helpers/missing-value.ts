/**
 * 检查值是否为缺失值（null 或 undefined）
 */
export function isMissing(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * 填充数据点数组中的缺失值
 * @param points - 数据点数组
 * @param key - 要填充的属性名
 * @param strategy - 填充策略：'null' 保持 null，'forward' 前向填充
 * @returns 新的数据点数组（不可变）
 */
export function fillMissing<T extends Record<string, unknown>>(
  points: T[],
  key: keyof T,
  strategy: 'null' | 'forward',
): T[] {
  if (strategy === 'null') {
    // null 策略：将 undefined 转为 null
    return points.map((point) => {
      const value = point[key];
      if (value === undefined) {
        return { ...point, [key]: null };
      }
      return point;
    });
  }

  // forward 策略：用前一个非缺失值填充
  let lastValid: unknown = null;
  return points.map((point) => {
    const value = point[key];
    if (!isMissing(value)) {
      lastValid = value;
      return point;
    }
    if (lastValid !== null && lastValid !== undefined) {
      return { ...point, [key]: lastValid };
    }
    return { ...point, [key]: null };
  });
}
