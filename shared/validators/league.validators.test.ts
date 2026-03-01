import {
  createLeagueSchema,
  updateLeagueSchema,
  joinLeagueSchema,
  leagueIdSchema,
  removeMemberSchema,
  transferAdminSchema,
} from './league.validators';

describe('createLeagueSchema', () => {
  const validInput = { name: 'My League' };

  it('accepts valid input', () => {
    const result = createLeagueSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts valid input with description', () => {
    const result = createLeagueSchema.safeParse({ name: 'My League', description: 'Fun league' });
    expect(result.success).toBe(true);
  });

  it('defaults description to empty string when omitted', () => {
    const result = createLeagueSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
    }
  });

  it('rejects missing name', () => {
    const result = createLeagueSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createLeagueSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts name of exactly 50 chars', () => {
    const result = createLeagueSchema.safeParse({ name: 'a'.repeat(50) });
    expect(result.success).toBe(true);
  });

  it('rejects name longer than 50 chars', () => {
    const result = createLeagueSchema.safeParse({ name: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('accepts description of exactly 200 chars', () => {
    const result = createLeagueSchema.safeParse({ name: 'League', description: 'a'.repeat(200) });
    expect(result.success).toBe(true);
  });

  it('rejects description longer than 200 chars', () => {
    const result = createLeagueSchema.safeParse({ name: 'League', description: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('updateLeagueSchema', () => {
  const validInput = { id: 'league-123', name: 'Updated League' };

  it('accepts valid input', () => {
    const result = updateLeagueSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts id only without optional fields', () => {
    const result = updateLeagueSchema.safeParse({ id: 'league-123' });
    expect(result.success).toBe(true);
  });

  it('accepts id with description only', () => {
    const result = updateLeagueSchema.safeParse({ id: 'league-123', description: 'New desc' });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = updateLeagueSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(false);
  });

  it('rejects empty id', () => {
    const result = updateLeagueSchema.safeParse({ id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 50 chars', () => {
    const result = updateLeagueSchema.safeParse({ id: 'league-123', name: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects description longer than 200 chars', () => {
    const result = updateLeagueSchema.safeParse({
      id: 'league-123',
      description: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe('joinLeagueSchema', () => {
  it('accepts valid 6-character invite code', () => {
    const result = joinLeagueSchema.safeParse({ inviteCode: 'ABC123' });
    expect(result.success).toBe(true);
  });

  it('rejects invite code shorter than 6 chars', () => {
    const result = joinLeagueSchema.safeParse({ inviteCode: 'ABC12' });
    expect(result.success).toBe(false);
  });

  it('rejects invite code longer than 6 chars', () => {
    const result = joinLeagueSchema.safeParse({ inviteCode: 'ABC1234' });
    expect(result.success).toBe(false);
  });

  it('rejects missing invite code', () => {
    const result = joinLeagueSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('leagueIdSchema', () => {
  it('accepts valid leagueId', () => {
    const result = leagueIdSchema.safeParse({ leagueId: 'league-123' });
    expect(result.success).toBe(true);
  });

  it('rejects missing leagueId', () => {
    const result = leagueIdSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty leagueId', () => {
    const result = leagueIdSchema.safeParse({ leagueId: '' });
    expect(result.success).toBe(false);
  });
});

describe('removeMemberSchema', () => {
  it('accepts valid leagueId and userId', () => {
    const result = removeMemberSchema.safeParse({ leagueId: 'league-123', userId: 'user-456' });
    expect(result.success).toBe(true);
  });

  it('rejects missing leagueId', () => {
    const result = removeMemberSchema.safeParse({ userId: 'user-456' });
    expect(result.success).toBe(false);
  });

  it('rejects missing userId', () => {
    const result = removeMemberSchema.safeParse({ leagueId: 'league-123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty leagueId', () => {
    const result = removeMemberSchema.safeParse({ leagueId: '', userId: 'user-456' });
    expect(result.success).toBe(false);
  });

  it('rejects empty userId', () => {
    const result = removeMemberSchema.safeParse({ leagueId: 'league-123', userId: '' });
    expect(result.success).toBe(false);
  });
});

describe('transferAdminSchema', () => {
  it('accepts valid leagueId and newAdminId', () => {
    const result = transferAdminSchema.safeParse({
      leagueId: 'league-123',
      newAdminId: 'user-789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing leagueId', () => {
    const result = transferAdminSchema.safeParse({ newAdminId: 'user-789' });
    expect(result.success).toBe(false);
  });

  it('rejects missing newAdminId', () => {
    const result = transferAdminSchema.safeParse({ leagueId: 'league-123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty leagueId', () => {
    const result = transferAdminSchema.safeParse({ leagueId: '', newAdminId: 'user-789' });
    expect(result.success).toBe(false);
  });

  it('rejects empty newAdminId', () => {
    const result = transferAdminSchema.safeParse({ leagueId: 'league-123', newAdminId: '' });
    expect(result.success).toBe(false);
  });
});
