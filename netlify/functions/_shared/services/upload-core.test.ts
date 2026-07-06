import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';
import type { GolferDocument } from '../models/Golfer';
import type { TournamentDocument } from '../models/Tournament';
import type { ScoreDocument } from '../models/Score';
import type { SeasonDocument } from '../models/Season';
import {
  escapeRegex,
  getGolferCountTier,
  findSeasonForDate,
  getStatsKey,
  normalizeGolferKey,
  matchOrCreateGolfers,
  upsertTournament,
  bulkUpsertScores,
  reconcileParticipation,
  setParticipants,
  recalcGolferStats,
  type ScoreEntry,
} from './upload-core';

describe('upload-core pure helpers', () => {
  it('escapeRegex escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c')).toBe('a\\.b\\*c');
    expect(escapeRegex("O'Brien (Jr)")).toBe("O'Brien \\(Jr\\)");
  });

  it('getGolferCountTier buckets counts', () => {
    expect(getGolferCountTier(0)).toBe('0-10');
    expect(getGolferCountTier(10)).toBe('0-10');
    expect(getGolferCountTier(11)).toBe('10-20');
    expect(getGolferCountTier(19)).toBe('10-20');
    expect(getGolferCountTier(20)).toBe('20+');
    expect(getGolferCountTier(400)).toBe('20+');
  });

  it('getStatsKey maps season numbers', () => {
    expect(getStatsKey(2024)).toBe('stats2024');
    expect(getStatsKey(2025)).toBe('stats2025');
    expect(getStatsKey(2026)).toBe('stats2026');
    expect(getStatsKey(2023)).toBe('stats2024');
  });

  it('normalizeGolferKey lowercases and trims', () => {
    expect(normalizeGolferKey('  Tiger', 'Woods ')).toBe('tiger|woods');
    expect(normalizeGolferKey('TIGER', 'WOODS')).toBe('tiger|woods');
  });

  it('findSeasonForDate returns the covering season or null', () => {
    const seasons = [
      {
        name: '2025',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    ] as SeasonDocument[];
    expect(findSeasonForDate(new Date(2025, 5, 15), seasons)?.name).toBe('2025');
    expect(findSeasonForDate(new Date(2024, 5, 15), seasons)).toBeNull();
  });
});

// --- Collection mock helpers -------------------------------------------------

const cursor = <T>(items: T[]) => ({
  toArray: vi.fn().mockResolvedValue(items),
  project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
  sort: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(items) }),
});

const insertManyResult = (docs: unknown[]) => ({
  insertedIds: Object.fromEntries(docs.map((_, i) => [i, new ObjectId()])),
});

describe('matchOrCreateGolfers', () => {
  it('matches existing golfers and creates missing ones in a single insertMany', async () => {
    const existingId = new ObjectId();
    const golfersCol = {
      find: vi.fn().mockReturnValue(
        cursor([{ _id: existingId, firstName: 'Tiger', lastName: 'Woods' }])
      ),
      insertMany: vi.fn().mockImplementation((docs: unknown[]) =>
        Promise.resolve(insertManyResult(docs))
      ),
    } as unknown as Collection<GolferDocument>;

    const res = await matchOrCreateGolfers(golfersCol, [
      { firstName: 'Tiger', lastName: 'Woods' },
      { firstName: 'Rory', lastName: 'McIlroy' },
    ]);

    expect(res.matchedCount).toBe(1);
    expect(res.createdNames).toEqual(['Rory McIlroy']);
    expect(res.idByKey.get('tiger|woods')).toEqual(existingId);
    expect(golfersCol.insertMany).toHaveBeenCalledTimes(1);
  });

  it('dedupes duplicate input names (last wins) so only one golfer is created', async () => {
    const golfersCol = {
      find: vi.fn().mockReturnValue(cursor([])),
      insertMany: vi.fn().mockImplementation((docs: unknown[]) =>
        Promise.resolve(insertManyResult(docs))
      ),
    } as unknown as Collection<GolferDocument>;

    const res = await matchOrCreateGolfers(golfersCol, [
      { firstName: 'Tiger', lastName: 'Woods' },
      { firstName: 'TIGER', lastName: 'woods' },
    ]);

    expect(res.createdNames.length).toBe(1);
    const insertedDocs = (golfersCol.insertMany as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(insertedDocs).toHaveLength(1);
  });

  it('throws on ambiguous existing golfers (multiple records for one name)', async () => {
    const golfersCol = {
      find: vi.fn().mockReturnValue(
        cursor([
          { _id: new ObjectId(), firstName: 'Tiger', lastName: 'Woods' },
          { _id: new ObjectId(), firstName: 'tiger', lastName: 'woods' },
        ])
      ),
      insertMany: vi.fn(),
    } as unknown as Collection<GolferDocument>;

    await expect(
      matchOrCreateGolfers(golfersCol, [{ firstName: 'Tiger', lastName: 'Woods' }])
    ).rejects.toThrow(/Ambiguous golfer match/);
  });

  it('skips insertMany when all golfers already exist', async () => {
    const golfersCol = {
      find: vi.fn().mockReturnValue(
        cursor([{ _id: new ObjectId(), firstName: 'Tiger', lastName: 'Woods' }])
      ),
      insertMany: vi.fn(),
    } as unknown as Collection<GolferDocument>;

    const res = await matchOrCreateGolfers(golfersCol, [{ firstName: 'Tiger', lastName: 'Woods' }]);
    expect(res.createdNames).toEqual([]);
    expect(golfersCol.insertMany).not.toHaveBeenCalled();
  });
});

describe('upsertTournament', () => {
  const meta = {
    name: 'Club Champs',
    season: 2025,
    startDate: new Date(2025, 5, 1),
    endDate: new Date(2025, 5, 1),
    tournamentType: 'club_champs_nett' as const,
    scoringFormat: 'medal' as const,
    isMultiDay: false,
    multiplier: 2,
    golferCountTier: '20+' as const,
  };

  it('inserts a new tournament when none exists', async () => {
    const insertedId = new ObjectId();
    const tournamentsCol = {
      findOne: vi.fn().mockResolvedValue(null),
      insertOne: vi.fn().mockResolvedValue({ insertedId }),
      updateOne: vi.fn(),
    } as unknown as Collection<TournamentDocument>;

    const res = await upsertTournament(tournamentsCol, meta);
    expect(res.created).toBe(true);
    expect(res.tournamentId).toEqual(insertedId);
    expect(tournamentsCol.insertOne).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing tournament and preserves its status', async () => {
    const existingId = new ObjectId();
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const tournamentsCol = {
      findOne: vi.fn().mockResolvedValue({ _id: existingId, status: 'published' }),
      insertOne: vi.fn(),
      updateOne,
    } as unknown as Collection<TournamentDocument>;

    const res = await upsertTournament(tournamentsCol, meta);
    expect(res.created).toBe(false);
    expect(res.tournamentId).toEqual(existingId);
    expect(tournamentsCol.insertOne).not.toHaveBeenCalled();
    // status must NOT be part of the $set (preserve manual state)
    const setPayload = updateOne.mock.calls[0][1].$set;
    expect(setPayload).not.toHaveProperty('status');
  });
});

describe('bulkUpsertScores', () => {
  it('writes one bulkWrite op per entry and returns the count', async () => {
    const bulkWrite = vi.fn().mockResolvedValue({ upsertedCount: 2 });
    const scoresCol = { bulkWrite } as unknown as Collection<ScoreDocument>;
    const entries: ScoreEntry[] = [
      { golferId: new ObjectId(), position: 1, rawScore: 40 },
      { golferId: new ObjectId(), position: 2, rawScore: 36 },
    ];

    const n = await bulkUpsertScores(
      scoresCol,
      new ObjectId(),
      entries,
      'stableford',
      false,
      1,
      'rollup_stableford'
    );

    expect(n).toBe(2);
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    expect(bulkWrite.mock.calls[0][0]).toHaveLength(2);
    expect(bulkWrite.mock.calls[0][1]).toEqual({ ordered: false });
  });

  it('is a no-op for an empty batch', async () => {
    const bulkWrite = vi.fn();
    const scoresCol = { bulkWrite } as unknown as Collection<ScoreDocument>;
    const n = await bulkUpsertScores(
      scoresCol,
      new ObjectId(),
      [],
      'stableford',
      false,
      1,
      'rollup_stableford'
    );
    expect(n).toBe(0);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it('wraps bulkWrite failures in a clear error', async () => {
    const bulkWrite = vi.fn().mockRejectedValue(new Error('duplicate key'));
    const scoresCol = { bulkWrite } as unknown as Collection<ScoreDocument>;
    await expect(
      bulkUpsertScores(
        scoresCol,
        new ObjectId(),
        [{ golferId: new ObjectId(), position: 1, rawScore: 40 }],
        'stableford',
        false,
        1,
        'rollup_stableford'
      )
    ).rejects.toThrow(/Failed to write tournament scores/);
  });
});

describe('reconcileParticipation & setParticipants', () => {
  it('retires golfers not in the current upload', async () => {
    const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const scoresCol = { updateMany } as unknown as Collection<ScoreDocument>;
    const current = [new ObjectId()];
    const tId = new ObjectId();

    await reconcileParticipation(scoresCol, tId, current);
    const filter = updateMany.mock.calls[0][0];
    expect(filter.tournamentId).toEqual(tId);
    expect(filter.golferId.$nin).toEqual(current);
    expect(updateMany.mock.calls[0][1].$set.participated).toBe(false);
  });

  it('sets participants to a deduped id list', async () => {
    const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const tournamentsCol = { updateOne } as unknown as Collection<TournamentDocument>;
    const shared = new ObjectId();
    const tId = new ObjectId();

    await setParticipants(tournamentsCol, tId, [shared, shared, new ObjectId()]);
    const set = updateOne.mock.calls[0][1].$set;
    expect(set.participatingGolferIds).toHaveLength(2);
  });
});

describe('recalcGolferStats', () => {
  it('resets affected golfers to zero then fills from participated scores', async () => {
    const g1 = new ObjectId();
    const g2 = new ObjectId(); // dropped golfer — no scores
    const bulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    const golfersCol = { bulkWrite } as unknown as Collection<GolferDocument>;
    const scoresCol = {
      find: vi.fn().mockReturnValue(
        cursor([{ golferId: g1, position: 1, rawScore: 40, participated: true }])
      ),
    } as unknown as Collection<ScoreDocument>;

    await recalcGolferStats(
      golfersCol,
      scoresCol,
      [g1, g2],
      [{ statsKey: 'stats2025', tournamentIds: [new ObjectId()] }]
    );

    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const ops = bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    const byId = new Map(
      ops.map((op: { updateOne: { filter: { _id: ObjectId }; update: Record<string, unknown> } }) => [
        op.updateOne.filter._id.toString(),
        op.updateOne.update.$set.stats2025,
      ])
    );
    expect(byId.get(g1.toString()).timesPlayed).toBe(1);
    expect(byId.get(g1.toString()).timesFinished1st).toBe(1);
    // dropped golfer reset to zero
    expect(byId.get(g2.toString()).timesPlayed).toBe(0);
  });

  it('is a no-op when there are no affected golfers', async () => {
    const bulkWrite = vi.fn();
    const golfersCol = { bulkWrite } as unknown as Collection<GolferDocument>;
    const scoresCol = { find: vi.fn() } as unknown as Collection<ScoreDocument>;
    await recalcGolferStats(golfersCol, scoresCol, [], [
      { statsKey: 'stats2025', tournamentIds: [new ObjectId()] },
    ]);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});
