// Unit tests for scoring helpers (getBasePointsForPosition, getBonusPoints)

import { getBasePointsForPosition, getBonusPoints } from '../../../../shared/types/tournament.types';

describe('getBasePointsForPosition', () => {
  it('returns 10 for 1st place', () => {
    expect(getBasePointsForPosition(1)).toBe(10);
  });

  it('returns 7 for 2nd place', () => {
    expect(getBasePointsForPosition(2)).toBe(7);
  });

  it('returns 5 for 3rd place', () => {
    expect(getBasePointsForPosition(3)).toBe(5);
  });

  it('returns 0 for 4th place and beyond', () => {
    expect(getBasePointsForPosition(4)).toBe(0);
    expect(getBasePointsForPosition(10)).toBe(0);
    expect(getBasePointsForPosition(50)).toBe(0);
  });

  it('returns 0 for null position', () => {
    expect(getBasePointsForPosition(null)).toBe(0);
  });
});

describe('getBonusPoints - Stableford', () => {
  it('returns 3 for score >= 36', () => {
    expect(getBonusPoints(36, 'stableford')).toBe(3);
    expect(getBonusPoints(40, 'stableford')).toBe(3);
    expect(getBonusPoints(42, 'stableford')).toBe(3);
  });

  it('returns 1 for score 32-35', () => {
    expect(getBonusPoints(32, 'stableford')).toBe(1);
    expect(getBonusPoints(33, 'stableford')).toBe(1);
    expect(getBonusPoints(35, 'stableford')).toBe(1);
  });

  it('returns 0 for score < 32', () => {
    expect(getBonusPoints(31, 'stableford')).toBe(0);
    expect(getBonusPoints(20, 'stableford')).toBe(0);
    expect(getBonusPoints(0, 'stableford')).toBe(0);
  });

  it('returns 0 for null score', () => {
    expect(getBonusPoints(null, 'stableford')).toBe(0);
  });
});

describe('getBonusPoints - Medal', () => {
  it('returns 3 for score <= 72', () => {
    expect(getBonusPoints(72, 'medal')).toBe(3);
    expect(getBonusPoints(70, 'medal')).toBe(3);
    expect(getBonusPoints(65, 'medal')).toBe(3);
  });

  it('returns 1 for score 73-76', () => {
    expect(getBonusPoints(73, 'medal')).toBe(1);
    expect(getBonusPoints(75, 'medal')).toBe(1);
    expect(getBonusPoints(76, 'medal')).toBe(1);
  });

  it('returns 0 for score > 76', () => {
    expect(getBonusPoints(77, 'medal')).toBe(0);
    expect(getBonusPoints(80, 'medal')).toBe(0);
    expect(getBonusPoints(100, 'medal')).toBe(0);
  });

  it('returns 0 for null score', () => {
    expect(getBonusPoints(null, 'medal')).toBe(0);
  });
});

describe('Scoring formula integration', () => {
  it('calculates correct total for 1st place + 36 stableford + 2x multiplier', () => {
    const basePoints = getBasePointsForPosition(1);
    const bonusPoints = getBonusPoints(36, 'stableford');
    const multipliedPoints = (basePoints + bonusPoints) * 2;
    expect(multipliedPoints).toBe(26); // (10 + 3) * 2
  });

  it('calculates correct total for 3rd place + 33 stableford + 3x multiplier', () => {
    const basePoints = getBasePointsForPosition(3);
    const bonusPoints = getBonusPoints(33, 'stableford');
    const multipliedPoints = (basePoints + bonusPoints) * 3;
    expect(multipliedPoints).toBe(18); // (5 + 1) * 3
  });

  it('calculates correct total for no placement + 36 stableford + 1x', () => {
    const basePoints = getBasePointsForPosition(null);
    const bonusPoints = getBonusPoints(36, 'stableford');
    const multipliedPoints = (basePoints + bonusPoints) * 1;
    expect(multipliedPoints).toBe(3); // (0 + 3) * 1
  });

  it('calculates correct total for 1st place + 70 medal + 3x multiplier', () => {
    const basePoints = getBasePointsForPosition(1);
    const bonusPoints = getBonusPoints(70, 'medal');
    const multipliedPoints = (basePoints + bonusPoints) * 3;
    expect(multipliedPoints).toBe(39); // (10 + 3) * 3
  });

  it('gives 0 points for non-participating golfer', () => {
    const basePoints = getBasePointsForPosition(null);
    const bonusPoints = getBonusPoints(null, 'stableford');
    expect(basePoints + bonusPoints).toBe(0);
  });

  it('bonus is exclusive - 36 gives 3pts not 4pts (3+1)', () => {
    const bonus = getBonusPoints(36, 'stableford');
    expect(bonus).toBe(3); // Not 4 (3 for 36+ and 1 for 32+)
  });

  it('bonus is exclusive for medal - 70 gives 3pts not 4pts', () => {
    const bonus = getBonusPoints(70, 'medal');
    expect(bonus).toBe(3); // Not 4
  });
});
