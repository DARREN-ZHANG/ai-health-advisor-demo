export { protocolScorer } from './protocol-scorer';
export { lengthScorer } from './length-scorer';
export { statusScorer } from './status-scorer';
export { tokenScorer } from './token-scorer';

import type { EvalCheckResult, EvalScorerInput } from '../types';
import { protocolScorer } from './protocol-scorer';
import { lengthScorer } from './length-scorer';
import { statusScorer } from './status-scorer';
import { tokenScorer } from './token-scorer';

// ── Scorer 接口 ──────────────────────────────────────────

export interface EvalScorer {
  readonly id: string;
  score(input: EvalScorerInput): EvalCheckResult[];
}

// ── 默认 Scorer 集合 ────────────────────────────────────

export const DEFAULT_SCORERS: EvalScorer[] = [
  protocolScorer,
  lengthScorer,
  statusScorer,
  tokenScorer,
];
