import { tournamentUploadSchema } from './tournament-upload.validator';

describe('tournamentUploadSchema', () => {
  const validPayload = {
    name: 'Friday Roll Up',
    date: '2026-04-03',
    tournamentType: 'rollup_stableford',
    scoringFormat: 'stableford',
    isMultiDay: false,
    golfers: [
      { position: 1, firstName: 'Ashley', lastName: 'Brinsford', rawScore: 46 },
      { position: 2, firstName: 'David', lastName: 'Husk', rawScore: 42 },
    ],
  };

  it('accepts a valid payload', () => {
    const result = tournamentUploadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = tournamentUploadSchema.safeParse({ ...validPayload, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name shorter than 3 characters', () => {
    const result = tournamentUploadSchema.safeParse({ ...validPayload, name: 'Ab' });
    expect(result.success).toBe(false);
  });

  it('rejects missing date', () => {
    const result = tournamentUploadSchema.safeParse({ ...validPayload, date: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid tournament type', () => {
    const result = tournamentUploadSchema.safeParse({
      ...validPayload,
      tournamentType: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid scoring format', () => {
    const result = tournamentUploadSchema.safeParse({
      ...validPayload,
      scoringFormat: 'bogey',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty golfers array', () => {
    const result = tournamentUploadSchema.safeParse({ ...validPayload, golfers: [] });
    expect(result.success).toBe(false);
  });

  it('rejects golfer with missing firstName', () => {
    const result = tournamentUploadSchema.safeParse({
      ...validPayload,
      golfers: [{ position: 1, firstName: '', lastName: 'Test', rawScore: 30 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects golfer with negative position', () => {
    const result = tournamentUploadSchema.safeParse({
      ...validPayload,
      golfers: [{ position: 0, firstName: 'Test', lastName: 'Player', rawScore: 30 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects golfer with negative rawScore', () => {
    const result = tournamentUploadSchema.safeParse({
      ...validPayload,
      golfers: [{ position: 1, firstName: 'Test', lastName: 'Player', rawScore: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('defaults isMultiDay to false', () => {
    const payload = { ...validPayload };
    delete (payload as Record<string, unknown>).isMultiDay;
    const result = tournamentUploadSchema.parse(payload);
    expect(result.isMultiDay).toBe(false);
  });

  it('accepts all valid tournament types', () => {
    const types = [
      'rollup_stableford',
      'weekday_medal',
      'weekend_medal',
      'presidents_cup',
      'founders',
      'club_champs_nett',
    ];
    for (const type of types) {
      const result = tournamentUploadSchema.safeParse({
        ...validPayload,
        tournamentType: type,
      });
      expect(result.success).toBe(true);
    }
  });
});
