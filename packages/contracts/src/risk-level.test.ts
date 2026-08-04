import { describe, expect, it } from 'vitest';

import { isRiskLevel, RISK_LEVELS } from './risk-level.js';

describe('RiskLevel', () => {
  it('declares exactly the four levels from RFC-001 §5', () => {
    expect(RISK_LEVELS).toEqual(['read', 'write_reversible', 'write_irreversible', 'financial']);
  });

  it('isRiskLevel narrows unknown input correctly', () => {
    expect(isRiskLevel('financial')).toBe(true);
    expect(isRiskLevel('made_up_level')).toBe(false);
    expect(isRiskLevel(42)).toBe(false);
  });
});
