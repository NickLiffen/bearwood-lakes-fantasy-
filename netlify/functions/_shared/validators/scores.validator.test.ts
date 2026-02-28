import { enterScoreSchema, bulkEnterScoresSchema } from './scores.validator';

describe('enterScoreSchema', () => {
  it('accepts valid input', () => {
    const result = enterScoreSchema.safeParse({
      tournamentId: 'abc123',
      golferId: 'golfer1',
      position: 1,
      rawScore: 72,
      participated: true,
    });
    expect(result.success).toBe(true);
  });

  it('requires tournamentId', () => {
    const result = enterScoreSchema.safeParse({ golferId: 'g1' });
    expect(result.success).toBe(false);
  });

  it('requires golferId', () => {
    const result = enterScoreSchema.safeParse({ tournamentId: 't1' });
    expect(result.success).toBe(false);
  });

  it('rejects empty tournamentId', () => {
    const result = enterScoreSchema.safeParse({ tournamentId: '', golferId: 'g1' });
    expect(result.success).toBe(false);
  });

  it('rejects empty golferId', () => {
    const result = enterScoreSchema.safeParse({ tournamentId: 't1', golferId: '' });
    expect(result.success).toBe(false);
  });

  it('allows position to be null', () => {
    const result = enterScoreSchema.safeParse({
      tournamentId: 't1',
      golferId: 'g1',
      position: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects position < 1', () => {
    const result = enterScoreSchema.safeParse({
      tournamentId: 't1',
      golferId: 'g1',
      position: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects position > 100', () => {
    const result = enterScoreSchema.safeParse({
      tournamentId: 't1',
      golferId: 'g1',
      position: 101,
    });
    expect(result.success).toBe(false);
  });

  it('defaults participated to true', () => {
    const result = enterScoreSchema.parse({
      tournamentId: 't1',
      golferId: 'g1',
    });
    expect(result.participated).toBe(true);
  });
});

describe('bulkEnterScoresSchema', () => {
  const validScore = (overrides = {}) => ({
    golferId: 'g1',
    participated: true,
    rawScore: 36,
    position: null,
    ...overrides,
  });

  it('accepts valid bulk entry with 1 participant and 1st place', () => {
    const result = bulkEnterScoresSchema.safeParse({
      tournamentId: 't1',
      scores: [validScore({ position: 1 })],
    });
    expect(result.success).toBe(true);
  });

  it('requires at least one score entry', () => {
    const result = bulkEnterScoresSchema.safeParse({
      tournamentId: 't1',
      scores: [],
    });
    expect(result.success).toBe(false);
  });

  it('requires tournamentId', () => {
    const result = bulkEnterScoresSchema.safeParse({
      scores: [validScore({ position: 1 })],
    });
    expect(result.success).toBe(false);
  });

  describe('superRefine rules', () => {
    it('fails when no golfer participated', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          { golferId: 'g1', participated: false },
          { golferId: 'g2', participated: false },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.toLowerCase().includes('at least one golfer must have participated'))).toBe(
          true
        );
      }
    });

    it('fails when participating golfer is missing rawScore', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          { golferId: 'g1', participated: true, rawScore: null, position: 1 },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('raw score'))).toBe(true);
      }
    });

    it('fails when no 1st place is assigned', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [validScore({ position: 2 })],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('1st place'))).toBe(true);
      }
    });

    it('fails when 2+ participants but no 2nd place', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          validScore({ golferId: 'g2', position: null }),
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('2nd place'))).toBe(true);
      }
    });

    it('passes when 2 participants with 1st and 2nd place', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          validScore({ golferId: 'g2', position: 2 }),
        ],
      });
      expect(result.success).toBe(true);
    });

    it('fails when 3+ participants but no 3rd place', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          validScore({ golferId: 'g2', position: 2 }),
          validScore({ golferId: 'g3', position: null }),
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('3rd place'))).toBe(true);
      }
    });

    it('passes when 3 participants with 1st, 2nd, and 3rd place', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          validScore({ golferId: 'g2', position: 2 }),
          validScore({ golferId: 'g3', position: 3 }),
        ],
      });
      expect(result.success).toBe(true);
    });

    it('fails when duplicate podium positions exist', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          validScore({ golferId: 'g2', position: 1 }),
          validScore({ golferId: 'g3', position: 2 }),
          validScore({ golferId: 'g4', position: 3 }),
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes('Duplicate positions'))).toBe(true);
      }
    });

    it('allows non-participating golfers without rawScore', () => {
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          { golferId: 'g2', participated: false },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('only checks participating golfers for position rules', () => {
      // 1 participant + 1 non-participant = only need 1st place
      const result = bulkEnterScoresSchema.safeParse({
        tournamentId: 't1',
        scores: [
          validScore({ golferId: 'g1', position: 1 }),
          { golferId: 'g2', participated: false },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});
