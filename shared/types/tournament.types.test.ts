import {
  getBasePointsForPosition,
  getBonusPoints,
  getMultiplierForType,
  getTournamentTypeLabel,
  TOURNAMENT_TYPE_CONFIG,
  type TournamentType,
} from './tournament.types';

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

  it('returns 0 for positions outside top 3', () => {
    expect(getBasePointsForPosition(4)).toBe(0);
    expect(getBasePointsForPosition(10)).toBe(0);
    expect(getBasePointsForPosition(100)).toBe(0);
  });

  it('returns 0 for null position', () => {
    expect(getBasePointsForPosition(null)).toBe(0);
  });

  it('returns 0 for 0th position', () => {
    expect(getBasePointsForPosition(0)).toBe(0);
  });

  it('returns 0 for negative position', () => {
    expect(getBasePointsForPosition(-1)).toBe(0);
  });
});

describe('getBonusPoints', () => {
  describe('stableford single-day', () => {
    it('returns 3 for score >= 36', () => {
      expect(getBonusPoints(36, 'stableford')).toBe(3);
      expect(getBonusPoints(40, 'stableford')).toBe(3);
      expect(getBonusPoints(100, 'stableford')).toBe(3);
    });

    it('returns 1 for score >= 32 and < 36', () => {
      expect(getBonusPoints(32, 'stableford')).toBe(1);
      expect(getBonusPoints(33, 'stableford')).toBe(1);
      expect(getBonusPoints(35, 'stableford')).toBe(1);
    });

    it('returns 0 for score < 32', () => {
      expect(getBonusPoints(31, 'stableford')).toBe(0);
      expect(getBonusPoints(0, 'stableford')).toBe(0);
      expect(getBonusPoints(1, 'stableford')).toBe(0);
    });

    it('returns 0 for null score', () => {
      expect(getBonusPoints(null, 'stableford')).toBe(0);
    });
  });

  describe('stableford multi-day', () => {
    it('returns 3 for score >= 72', () => {
      expect(getBonusPoints(72, 'stableford', true)).toBe(3);
      expect(getBonusPoints(80, 'stableford', true)).toBe(3);
    });

    it('returns 1 for score >= 64 and < 72', () => {
      expect(getBonusPoints(64, 'stableford', true)).toBe(1);
      expect(getBonusPoints(71, 'stableford', true)).toBe(1);
    });

    it('returns 0 for score < 64', () => {
      expect(getBonusPoints(63, 'stableford', true)).toBe(0);
      expect(getBonusPoints(0, 'stableford', true)).toBe(0);
    });

    it('returns 0 for null score', () => {
      expect(getBonusPoints(null, 'stableford', true)).toBe(0);
    });
  });

  describe('medal single-day', () => {
    it('returns 3 for score <= 0 (par or better)', () => {
      expect(getBonusPoints(0, 'medal')).toBe(3);
      expect(getBonusPoints(-1, 'medal')).toBe(3);
      expect(getBonusPoints(-5, 'medal')).toBe(3);
    });

    it('returns 1 for score > 0 and <= 4', () => {
      expect(getBonusPoints(1, 'medal')).toBe(1);
      expect(getBonusPoints(4, 'medal')).toBe(1);
    });

    it('returns 0 for score > 4', () => {
      expect(getBonusPoints(5, 'medal')).toBe(0);
      expect(getBonusPoints(10, 'medal')).toBe(0);
    });

    it('returns 0 for null score', () => {
      expect(getBonusPoints(null, 'medal')).toBe(0);
    });
  });

  describe('medal multi-day', () => {
    it('returns 3 for score <= 0', () => {
      expect(getBonusPoints(0, 'medal', true)).toBe(3);
      expect(getBonusPoints(-3, 'medal', true)).toBe(3);
    });

    it('returns 1 for score > 0 and <= 8', () => {
      expect(getBonusPoints(1, 'medal', true)).toBe(1);
      expect(getBonusPoints(8, 'medal', true)).toBe(1);
    });

    it('returns 0 for score > 8', () => {
      expect(getBonusPoints(9, 'medal', true)).toBe(0);
      expect(getBonusPoints(20, 'medal', true)).toBe(0);
    });

    it('returns 0 for null score', () => {
      expect(getBonusPoints(null, 'medal', true)).toBe(0);
    });
  });

  describe('isMultiDay defaults to false', () => {
    it('uses single-day thresholds when isMultiDay is omitted', () => {
      expect(getBonusPoints(36, 'stableford')).toBe(3);
      expect(getBonusPoints(64, 'stableford')).toBe(3); // 64 >= 36 single-day threshold
      expect(getBonusPoints(33, 'stableford')).toBe(1); // 33 >= 32 single-day low threshold
      expect(getBonusPoints(4, 'medal')).toBe(1);
    });
  });
});

describe('TOURNAMENT_TYPE_CONFIG', () => {
  const allTypes: TournamentType[] = [
    'rollup_stableford',
    'weekday_medal',
    'weekend_medal',
    'presidents_cup',
    'founders',
    'club_champs_nett',
  ];

  it('contains all 6 tournament types', () => {
    expect(Object.keys(TOURNAMENT_TYPE_CONFIG)).toHaveLength(6);
    for (const t of allTypes) {
      expect(TOURNAMENT_TYPE_CONFIG).toHaveProperty(t);
    }
  });

  it('rollup_stableford has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.rollup_stableford;
    expect(cfg.label).toBe('Rollup Stableford');
    expect(cfg.multiplier).toBe(1);
    expect(cfg.defaultScoringFormat).toBe('stableford');
    expect(cfg.forcedScoringFormat).toBe('stableford');
    expect(cfg.defaultMultiDay).toBe(false);
  });

  it('weekday_medal has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.weekday_medal;
    expect(cfg.label).toBe('Weekday Medal');
    expect(cfg.multiplier).toBe(1);
    expect(cfg.defaultScoringFormat).toBe('medal');
    expect(cfg.forcedScoringFormat).toBe('medal');
    expect(cfg.defaultMultiDay).toBe(false);
  });

  it('weekend_medal has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.weekend_medal;
    expect(cfg.label).toBe('Weekend Medal');
    expect(cfg.multiplier).toBe(2);
    expect(cfg.defaultScoringFormat).toBe('medal');
    expect(cfg.forcedScoringFormat).toBe('medal');
    expect(cfg.defaultMultiDay).toBe(false);
  });

  it('presidents_cup has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.presidents_cup;
    expect(cfg.label).toBe('Presidents Cup');
    expect(cfg.multiplier).toBe(3);
    expect(cfg.defaultScoringFormat).toBe('stableford');
    expect(cfg.forcedScoringFormat).toBeNull();
    expect(cfg.defaultMultiDay).toBe(false);
  });

  it('founders has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.founders;
    expect(cfg.label).toBe('Founders');
    expect(cfg.multiplier).toBe(4);
    expect(cfg.defaultScoringFormat).toBe('stableford');
    expect(cfg.forcedScoringFormat).toBeNull();
    expect(cfg.defaultMultiDay).toBe(true);
  });

  it('club_champs_nett has correct config', () => {
    const cfg = TOURNAMENT_TYPE_CONFIG.club_champs_nett;
    expect(cfg.label).toBe('Club Champs Nett');
    expect(cfg.multiplier).toBe(5);
    expect(cfg.defaultScoringFormat).toBe('medal');
    expect(cfg.forcedScoringFormat).toBeNull();
    expect(cfg.defaultMultiDay).toBe(true);
  });
});

describe('getMultiplierForType', () => {
  it.each([
    ['rollup_stableford', 1],
    ['weekday_medal', 1],
    ['weekend_medal', 2],
    ['presidents_cup', 3],
    ['founders', 4],
    ['club_champs_nett', 5],
  ] as [TournamentType, number][])('returns %i for %s', (type, expected) => {
    expect(getMultiplierForType(type)).toBe(expected);
  });
});

describe('getTournamentTypeLabel', () => {
  it.each([
    ['rollup_stableford', 'Rollup Stableford'],
    ['weekday_medal', 'Weekday Medal'],
    ['weekend_medal', 'Weekend Medal'],
    ['presidents_cup', 'Presidents Cup'],
    ['founders', 'Founders'],
    ['club_champs_nett', 'Club Champs Nett'],
  ] as [TournamentType, string][])('returns "%s" for %s', (type, expected) => {
    expect(getTournamentTypeLabel(type)).toBe(expected);
  });
});
