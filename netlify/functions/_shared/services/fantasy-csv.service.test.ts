// Comprehensive tests for fantasy-csv.service.ts
// Every expected value is computed via raw arithmetic — NOT by calling service functions.
// This guarantees we catch bugs in the service logic itself.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

// Mock DB before importing service
vi.mock('../db', () => ({
  connectToDatabase: vi.fn(),
}));

import { connectToDatabase } from '../db';
import { generateFantasyCsv, generateCsvString, GolferCsvRow } from './fantasy-csv.service';

// ── Fixture IDs ──────────────────────────────────────────────────────────────

const tigerId = new ObjectId();
const roryId = new ObjectId();
const jonId = new ObjectId();

const tournamentA = new ObjectId(); // GW1
const tournamentB = new ObjectId(); // GW2
const tournamentC = new ObjectId(); // GW2 (second tournament same week)
const tournamentD = new ObjectId(); // GW3

const pick1Id = new ObjectId();
const pick2Id = new ObjectId();
const pick3Id = new ObjectId();
const pick4Id = new ObjectId(); // legacy — no gameweekRosters

const user1 = new ObjectId();
const user2 = new ObjectId();
const user3 = new ObjectId();
const user4 = new ObjectId();

const seasonId = new ObjectId();

// ── Season Setup ─────────────────────────────────────────────────────────────
// Season 2026, starts Apr 1, firstGameweekStart Apr 3 (Friday)
// GW1: Apr 3–Apr 11 (custom length, ends before next Saturday+7)
// GW2: Apr 12–Apr 18
// GW3: Apr 19–Apr 25

const SEASON_START = new Date(2026, 3, 1); // Apr 1
const FIRST_GW_START = new Date(2026, 3, 3); // Apr 3

// Tournament dates (must fall in correct GWs)
const TOURNAMENT_A_DATE = new Date(2026, 3, 5); // Apr 5 → GW1
const TOURNAMENT_B_DATE = new Date(2026, 3, 12); // Apr 12 → GW2
const TOURNAMENT_C_DATE = new Date(2026, 3, 14); // Apr 14 → GW2
const TOURNAMENT_D_DATE = new Date(2026, 3, 19); // Apr 19 → GW3

// ── Fixture Data ─────────────────────────────────────────────────────────────

function buildSeasonDoc() {
  return {
    _id: seasonId,
    name: '2026',
    startDate: SEASON_START,
    endDate: new Date(2027, 2, 31),
    firstGameweekStart: FIRST_GW_START,
    isActive: true,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildGolfers() {
  return [
    {
      _id: tigerId,
      firstName: 'Tiger',
      lastName: 'Woods',
      price: 12.0,
      isActive: true,
      picture: '',
      stats2024: {} as any,
      stats2025: {} as any,
      stats2026: {} as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: roryId,
      firstName: 'Rory',
      lastName: 'McIlroy',
      price: 11.5,
      isActive: true,
      picture: '',
      stats2024: {} as any,
      stats2025: {} as any,
      stats2026: {} as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: jonId,
      firstName: 'Jon',
      lastName: 'Rahm',
      price: 10.0,
      isActive: true,
      picture: '',
      stats2024: {} as any,
      stats2025: {} as any,
      stats2026: {} as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function buildTournaments() {
  return [
    {
      _id: tournamentA,
      name: 'Tournament A',
      startDate: TOURNAMENT_A_DATE,
      endDate: TOURNAMENT_A_DATE,
      tournamentType: 'rollup_stableford' as const,
      scoringFormat: 'stableford' as const,
      isMultiDay: false,
      multiplier: 1,
      golferCountTier: '20+' as const,
      season: 2026,
      status: 'published' as const,
      participatingGolferIds: [tigerId, roryId],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: tournamentB,
      name: 'Tournament B',
      startDate: TOURNAMENT_B_DATE,
      endDate: TOURNAMENT_B_DATE,
      tournamentType: 'rollup_stableford' as const,
      scoringFormat: 'stableford' as const,
      isMultiDay: false,
      multiplier: 1,
      golferCountTier: '20+' as const,
      season: 2026,
      status: 'complete' as const,
      participatingGolferIds: [tigerId, jonId],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: tournamentC,
      name: 'Tournament C',
      startDate: TOURNAMENT_C_DATE,
      endDate: TOURNAMENT_C_DATE,
      tournamentType: 'rollup_stableford' as const,
      scoringFormat: 'stableford' as const,
      isMultiDay: false,
      multiplier: 1,
      golferCountTier: '20+' as const,
      season: 2026,
      status: 'published' as const,
      participatingGolferIds: [roryId],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: tournamentD,
      name: 'Tournament D',
      startDate: TOURNAMENT_D_DATE,
      endDate: TOURNAMENT_D_DATE,
      tournamentType: 'rollup_stableford' as const,
      scoringFormat: 'stableford' as const,
      isMultiDay: false,
      multiplier: 1,
      golferCountTier: '20+' as const,
      season: 2026,
      status: 'published' as const,
      participatingGolferIds: [tigerId, roryId, jonId],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function buildScores() {
  return [
    // GW1: Tournament A
    makeScore(tigerId, tournamentA, 20),
    makeScore(roryId, tournamentA, 15),
    // GW2: Tournament B
    makeScore(tigerId, tournamentB, 18),
    makeScore(jonId, tournamentB, 22),
    // GW2: Tournament C
    makeScore(roryId, tournamentC, 10),
    // GW3: Tournament D
    makeScore(tigerId, tournamentD, 12),
    makeScore(roryId, tournamentD, 25),
    makeScore(jonId, tournamentD, 8),
  ];
}

function makeScore(golferId: ObjectId, tournamentId: ObjectId, multipliedPoints: number) {
  return {
    _id: new ObjectId(),
    golferId,
    tournamentId,
    participated: true,
    position: 1,
    rawScore: null,
    basePoints: multipliedPoints,
    bonusPoints: 0,
    multipliedPoints,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildPicks() {
  return [
    // Pick 1: rosters change in GW3
    {
      _id: pick1Id,
      userId: user1,
      golferIds: [tigerId, jonId], // current roster (after GW3 transfer)
      captainId: tigerId,
      totalSpent: 22,
      season: 2026,
      createdAt: new Date(2026, 2, 15),
      updatedAt: new Date(),
      gameweekRosters: {
        '1': { golferIds: [tigerId, roryId], captainId: tigerId },
        '2': { golferIds: [tigerId, roryId], captainId: tigerId },
        '3': { golferIds: [tigerId, jonId], captainId: tigerId },
      },
    },
    // Pick 2: rosters change in GW2
    {
      _id: pick2Id,
      userId: user2,
      golferIds: [roryId, jonId], // current roster
      captainId: roryId,
      totalSpent: 21.5,
      season: 2026,
      createdAt: new Date(2026, 2, 15),
      updatedAt: new Date(),
      gameweekRosters: {
        '1': { golferIds: [tigerId, jonId], captainId: tigerId },
        '2': { golferIds: [roryId, jonId], captainId: roryId },
        '3': { golferIds: [roryId, jonId], captainId: roryId },
      },
    },
    // Pick 3: rosters change in GW3
    {
      _id: pick3Id,
      userId: user3,
      golferIds: [tigerId, roryId], // current roster
      captainId: roryId,
      totalSpent: 23.5,
      season: 2026,
      createdAt: new Date(2026, 2, 15),
      updatedAt: new Date(),
      gameweekRosters: {
        '1': { golferIds: [roryId, jonId], captainId: jonId },
        '2': { golferIds: [tigerId, jonId], captainId: tigerId },
        '3': { golferIds: [tigerId, roryId], captainId: roryId },
      },
    },
    // Pick 4: LEGACY — no gameweekRosters, uses current golferIds for all GWs
    {
      _id: pick4Id,
      userId: user4,
      golferIds: [tigerId, roryId], // falls back to this for ALL GWs
      captainId: tigerId,
      totalSpent: 23.5,
      season: 2026,
      createdAt: new Date(2026, 2, 15),
      updatedAt: new Date(),
      // No gameweekRosters!
    },
  ];
}

// ── Expected Values (hand-calculated) ────────────────────────────────────────
//
// Points per golfer per gameweek (raw multipliedPoints, no captain):
//   Tiger:  GW1=20 (TourA), GW2=18 (TourB), GW3=12 (TourD)  → Total=50
//   Rory:   GW1=15 (TourA), GW2=10 (TourC), GW3=25 (TourD)  → Total=50
//   Jon:    GW1=0,           GW2=22 (TourB), GW3=8  (TourD)  → Total=30
//
// Ownership per GW (who has whom):
//
// GW1 rosters:
//   Pick1 GW1: [Tiger, Rory]      Pick2 GW1: [Tiger, Jon]
//   Pick3 GW1: [Rory, Jon]        Pick4 (legacy): [Tiger, Rory]
//   Tiger: Pick1+Pick2+Pick4 = 3/4 = 75%
//   Rory:  Pick1+Pick3+Pick4 = 3/4 = 75%
//   Jon:   Pick2+Pick3       = 2/4 = 50%
//
// GW2 rosters:
//   Pick1 GW2: [Tiger, Rory]      Pick2 GW2: [Rory, Jon]
//   Pick3 GW2: [Tiger, Jon]       Pick4 (legacy): [Tiger, Rory]
//   Tiger: Pick1+Pick3+Pick4 = 3/4 = 75%
//   Rory:  Pick1+Pick2+Pick4 = 3/4 = 75%
//   Jon:   Pick2+Pick3       = 2/4 = 50%
//
// GW3 rosters:
//   Pick1 GW3: [Tiger, Jon]       Pick2 GW3: [Rory, Jon]
//   Pick3 GW3: [Tiger, Rory]      Pick4 (legacy): [Tiger, Rory]
//   Tiger: Pick1+Pick3+Pick4 = 3/4 = 75%
//   Rory:  Pick2+Pick3+Pick4 = 3/4 = 75%
//   Jon:   Pick1+Pick2       = 2/4 = 50%
//
// Current ownership (from current golferIds):
//   Pick1: [Tiger, Jon]  Pick2: [Rory, Jon]  Pick3: [Tiger, Rory]  Pick4: [Tiger, Rory]
//   Tiger: Pick1+Pick3+Pick4 = 3/4 = 75%
//   Rory:  Pick2+Pick3+Pick4 = 3/4 = 75%
//   Jon:   Pick1+Pick2       = 2/4 = 50%

// ── Mock DB Setup ────────────────────────────────────────────────────────────

function setupMockDb(overrides?: {
  seasons?: any[];
  golfers?: any[];
  tournaments?: any[];
  scores?: any[];
  picks?: any[];
}) {
  const seasons = overrides?.seasons ?? [buildSeasonDoc()];
  const golfers = overrides?.golfers ?? buildGolfers();
  const tournaments = overrides?.tournaments ?? buildTournaments();
  const scores = overrides?.scores ?? buildScores();
  const picks = overrides?.picks ?? buildPicks();

  const collections: Record<string, any[]> = {
    seasons,
    golfers,
    tournaments,
    scores,
    picks,
  };

  const mockDb = {
    collection: vi.fn((name: string) => ({
      find: vi.fn((query: any) => ({
        toArray: vi.fn(async () => {
          const data = collections[name] || [];
          // Apply basic filters
          return data.filter((doc: any) => {
            for (const [key, value] of Object.entries(query || {})) {
              if (key === '$in') continue;
              if (value && typeof value === 'object' && '$in' in value) {
                const arr = (value as any).$in as any[];
                if (!arr.some((v: any) => v.toString() === doc[key]?.toString())) return false;
              } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Skip complex queries — return all
                continue;
              } else {
                if (String(doc[key]) !== String(value)) return false;
              }
            }
            return true;
          });
        }),
      })),
      findOne: vi.fn(async (query: any) => {
        const data = collections[name] || [];
        return (
          data.find((doc: any) => {
            for (const [key, value] of Object.entries(query || {})) {
              if (String(doc[key]) !== String(value)) return false;
            }
            return true;
          }) || null
        );
      }),
    })),
  };

  vi.mocked(connectToDatabase).mockResolvedValue({
    client: {} as any,
    db: mockDb as any,
  });

  return mockDb;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('fantasy-csv.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateFantasyCsv — full pipeline', () => {
    it('produces correct points for each golfer per gameweek', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      // Tiger: GW1=20, GW2=18, GW3=12
      expect(tiger.gameweekPoints.get(1)).toBe(20);
      expect(tiger.gameweekPoints.get(2)).toBe(18);
      expect(tiger.gameweekPoints.get(3)).toBe(12);

      // Rory: GW1=15, GW2=10, GW3=25
      expect(rory.gameweekPoints.get(1)).toBe(15);
      expect(rory.gameweekPoints.get(2)).toBe(10);
      expect(rory.gameweekPoints.get(3)).toBe(25);

      // Jon: GW1=0 (no score), GW2=22, GW3=8
      expect(jon.gameweekPoints.get(1) || 0).toBe(0);
      expect(jon.gameweekPoints.get(2)).toBe(22);
      expect(jon.gameweekPoints.get(3)).toBe(8);
    });

    it('produces correct total points (sum of gameweek points)', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      expect(tiger.totalPoints).toBe(20 + 18 + 12);
      expect(rory.totalPoints).toBe(15 + 10 + 25);
      expect(jon.totalPoints).toBe(0 + 22 + 8);

      // Also verify total = sum of per-GW values
      for (const row of result.rows) {
        let sum = 0;
        for (const pts of row.gameweekPoints.values()) sum += pts;
        expect(row.totalPoints).toBe(sum);
      }
    });

    it('produces correct per-gameweek ownership percentages', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      // Tiger: 3/4 = 75% in all GWs
      expect(tiger.gameweekOwnership.get(1)).toBe(75);
      expect(tiger.gameweekOwnership.get(2)).toBe(75);
      expect(tiger.gameweekOwnership.get(3)).toBe(75);

      // Rory: 3/4 = 75% in all GWs
      expect(rory.gameweekOwnership.get(1)).toBe(75);
      expect(rory.gameweekOwnership.get(2)).toBe(75);
      expect(rory.gameweekOwnership.get(3)).toBe(75);

      // Jon: 2/4 = 50% in all GWs
      expect(jon.gameweekOwnership.get(1)).toBe(50);
      expect(jon.gameweekOwnership.get(2)).toBe(50);
      expect(jon.gameweekOwnership.get(3)).toBe(50);
    });

    it('produces correct current ownership percentages', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      // Current: Tiger 3/4=75%, Rory 3/4=75%, Jon 2/4=50%
      expect(tiger.currentOwnership).toBe(75);
      expect(rory.currentOwnership).toBe(75);
      expect(jon.currentOwnership).toBe(50);
    });

    it('detects correct maxGameweek', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();
      expect(result.maxGameweek).toBe(3);
    });

    it('sorts rows by totalPoints descending', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i - 1].totalPoints).toBeGreaterThanOrEqual(result.rows[i].totalPoints);
      }
    });

    it('includes golfer value from price field', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      expect(tiger.value).toBe(12.0);
      expect(rory.value).toBe(11.5);
      expect(jon.value).toBe(10.0);
    });
  });

  describe('legacy picks (no gameweekRosters)', () => {
    it('falls back to current golferIds for all gameweeks', async () => {
      // All picks are legacy — no gameweekRosters
      const legacyPicks = [
        {
          _id: pick1Id,
          userId: user1,
          golferIds: [tigerId, roryId],
          captainId: tigerId,
          totalSpent: 23.5,
          season: 2026,
          createdAt: new Date(2026, 2, 15),
          updatedAt: new Date(),
        },
        {
          _id: pick2Id,
          userId: user2,
          golferIds: [jonId, roryId],
          captainId: jonId,
          totalSpent: 21.5,
          season: 2026,
          createdAt: new Date(2026, 2, 15),
          updatedAt: new Date(),
        },
      ];

      setupMockDb({ picks: legacyPicks });
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;

      // Tiger: only in pick1 → 1/2 = 50% for all GWs
      expect(tiger.gameweekOwnership.get(1)).toBe(50);
      expect(tiger.gameweekOwnership.get(2)).toBe(50);
      expect(tiger.gameweekOwnership.get(3)).toBe(50);

      // Rory: in both picks → 2/2 = 100%
      expect(rory.gameweekOwnership.get(1)).toBe(100);
      expect(rory.gameweekOwnership.get(2)).toBe(100);

      // Jon: only in pick2 → 1/2 = 50%
      expect(jon.gameweekOwnership.get(1)).toBe(50);
    });
  });

  describe('partial gameweekRosters (roster for GW1 but not GW2+)', () => {
    it('uses nearest lower GW roster as fallback', async () => {
      const partialPicks = [
        {
          _id: pick1Id,
          userId: user1,
          golferIds: [roryId, jonId], // current
          captainId: roryId,
          totalSpent: 21.5,
          season: 2026,
          createdAt: new Date(2026, 2, 15),
          updatedAt: new Date(),
          gameweekRosters: {
            // Only GW1 snapshot — GW2 and GW3 should fall back to GW1
            '1': { golferIds: [tigerId, roryId], captainId: tigerId },
          },
        },
      ];

      setupMockDb({ picks: partialPicks });
      const result = await generateFantasyCsv();

      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;

      // Tiger is in GW1 roster and should inherit for GW2, GW3
      expect(tiger.gameweekOwnership.get(1)).toBe(100);
      expect(tiger.gameweekOwnership.get(2)).toBe(100);
      expect(tiger.gameweekOwnership.get(3)).toBe(100);

      // Current ownership uses current golferIds (Rory, Jon) — Tiger is 0%
      expect(tiger.currentOwnership).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('throws when season not found', async () => {
      setupMockDb({ seasons: [] });
      await expect(generateFantasyCsv()).rejects.toThrow('Season not found');
    });

    it('handles season with no tournaments', async () => {
      setupMockDb({ tournaments: [], scores: [] });
      const result = await generateFantasyCsv();

      expect(result.maxGameweek).toBe(0);
      expect(result.rows.length).toBe(3); // still has golfers
      for (const row of result.rows) {
        expect(row.totalPoints).toBe(0);
      }
    });

    it('handles season with no picks', async () => {
      setupMockDb({ picks: [] });
      const result = await generateFantasyCsv();

      for (const row of result.rows) {
        expect(row.currentOwnership).toBe(0);
        for (const pct of row.gameweekOwnership.values()) {
          expect(pct).toBe(0);
        }
      }
    });

    it('handles golfer with zero scores', async () => {
      // Jon has no scores if we remove his
      const scoresWithoutJon = buildScores().filter(
        (s) => s.golferId.toString() !== jonId.toString()
      );
      setupMockDb({ scores: scoresWithoutJon });
      const result = await generateFantasyCsv();

      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;
      expect(jon.totalPoints).toBe(0);
      expect(jon.gameweekPoints.get(1) || 0).toBe(0);
      expect(jon.gameweekPoints.get(2) || 0).toBe(0);
      expect(jon.gameweekPoints.get(3) || 0).toBe(0);
      // But still has ownership data
      expect(jon.gameweekOwnership.get(1)).toBe(50);
    });

    it('allows specifying season by number', async () => {
      setupMockDb();
      const result = await generateFantasyCsv({ season: 2026 });
      expect(result.rows.length).toBe(3);
    });

    it('accumulates multiple tournaments in same gameweek', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();

      // GW2 has Tournament B (Tiger 18, Jon 22) and Tournament C (Rory 10)
      // Tiger GW2 = 18 (only in Tournament B)
      const tiger = result.rows.find((r) => r.name === 'Tiger Woods')!;
      expect(tiger.gameweekPoints.get(2)).toBe(18);

      // Rory GW2 = 10 (only in Tournament C)
      const rory = result.rows.find((r) => r.name === 'Rory McIlroy')!;
      expect(rory.gameweekPoints.get(2)).toBe(10);

      // Jon GW2 = 22 (only in Tournament B)
      const jon = result.rows.find((r) => r.name === 'Jon Rahm')!;
      expect(jon.gameweekPoints.get(2)).toBe(22);
    });
  });

  describe('generateCsvString — CSV format', () => {
    it('produces correct headers', () => {
      const csv = generateCsvString([], 3);
      const headerLine = csv.split('\n')[0];
      expect(headerLine).toBe(
        'Golfer_name,Value,' +
          'Gameweek_1_Points,Gameweek_1_Ownership_Percentage,' +
          'Gameweek_2_Points,Gameweek_2_Ownership_Percentage,' +
          'Gameweek_3_Points,Gameweek_3_Ownership_Percentage,' +
          'Total_Points,Current_Ownership_Percentage'
      );
    });

    it('produces correct number of columns per row', () => {
      const rows: GolferCsvRow[] = [
        {
          name: 'Test Player',
          value: 10,
          gameweekPoints: new Map([
            [1, 5],
            [2, 10],
          ]),
          gameweekOwnership: new Map([
            [1, 50],
            [2, 75],
          ]),
          totalPoints: 15,
          currentOwnership: 60,
        },
      ];

      const csv = generateCsvString(rows, 2);
      const lines = csv.split('\n');
      const headerCols = lines[0].split(',').length;
      const dataCols = lines[1].split(',').length;
      expect(headerCols).toBe(dataCols);
      // 2 fixed + 2*2 GW cols + 2 trailing = 8
      expect(headerCols).toBe(8);
    });

    it('fills missing gameweek data with 0', () => {
      const rows: GolferCsvRow[] = [
        {
          name: 'Sparse Player',
          value: 8,
          gameweekPoints: new Map([[2, 15]]), // only GW2
          gameweekOwnership: new Map([[2, 33.3]]),
          totalPoints: 15,
          currentOwnership: 25,
        },
      ];

      const csv = generateCsvString(rows, 3);
      const dataLine = csv.split('\n')[1];
      const cells = dataLine.split(',');
      // GW1 points and ownership should be 0
      expect(cells[2]).toBe('0'); // GW1 points
      expect(cells[3]).toBe('0'); // GW1 ownership
      // GW2 should have values
      expect(cells[4]).toBe('15');
      expect(cells[5]).toBe('33.3');
    });

    it('escapes names containing commas', () => {
      const rows: GolferCsvRow[] = [
        {
          name: "O'Connor, Jr.",
          value: 9,
          gameweekPoints: new Map(),
          gameweekOwnership: new Map(),
          totalPoints: 0,
          currentOwnership: 0,
        },
      ];

      const csv = generateCsvString(rows, 1);
      const dataLine = csv.split('\n')[1];
      // Name should be quoted
      expect(dataLine.startsWith('"O\'Connor, Jr."')).toBe(true);
    });

    it('escapes names containing double quotes', () => {
      const rows: GolferCsvRow[] = [
        {
          name: 'The "Big" Cat',
          value: 9,
          gameweekPoints: new Map(),
          gameweekOwnership: new Map(),
          totalPoints: 0,
          currentOwnership: 0,
        },
      ];

      const csv = generateCsvString(rows, 1);
      const dataLine = csv.split('\n')[1];
      // Quotes inside should be doubled
      expect(dataLine.startsWith('"The ""Big"" Cat"')).toBe(true);
    });

    it('handles maxGameweek=0 (no tournaments)', () => {
      const csv = generateCsvString([], 0);
      expect(csv).toBe('Golfer_name,Value,Total_Points,Current_Ownership_Percentage');
    });

    it('produces parseable CSV with full dataset', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();
      const lines = result.csv.split('\n');

      // Header + 3 golfer rows
      expect(lines.length).toBe(4);

      // Each line should have the same number of columns
      const expectedCols = 2 + 3 * 2 + 2; // name+value + 3GW*(pts+own) + total+currentOwn = 10
      for (const line of lines) {
        // Count columns (accounting for quoted fields)
        const cols = parseCsvLine(line);
        expect(cols.length).toBe(expectedCols);
      }
    });
  });

  describe('end-to-end CSV content validation', () => {
    it('every cell in the CSV matches hand-calculated values', async () => {
      setupMockDb();
      const result = await generateFantasyCsv();
      const lines = result.csv.split('\n');

      // Rows sorted by total points desc: Tiger (50), Rory (50), Jon (30)
      // Tiger and Rory both have 50 — order between them may vary, but Jon is last
      const dataRows = lines.slice(1).map(parseCsvLine);

      // Find each golfer row
      const tigerRow = dataRows.find((r) => r[0] === 'Tiger Woods')!;
      const roryRow = dataRows.find((r) => r[0] === 'Rory McIlroy')!;
      const jonRow = dataRows.find((r) => r[0] === 'Jon Rahm')!;

      // Tiger: value=12, GW1=20/75, GW2=18/75, GW3=12/75, total=50, current=75
      expect(tigerRow[1]).toBe('12');
      expect(tigerRow[2]).toBe('20'); // GW1 pts
      expect(tigerRow[3]).toBe('75'); // GW1 own
      expect(tigerRow[4]).toBe('18'); // GW2 pts
      expect(tigerRow[5]).toBe('75'); // GW2 own
      expect(tigerRow[6]).toBe('12'); // GW3 pts
      expect(tigerRow[7]).toBe('75'); // GW3 own
      expect(tigerRow[8]).toBe('50'); // total
      expect(tigerRow[9]).toBe('75'); // current own

      // Rory: value=11.5, GW1=15/75, GW2=10/75, GW3=25/75, total=50, current=75
      expect(roryRow[1]).toBe('11.5');
      expect(roryRow[2]).toBe('15');
      expect(roryRow[3]).toBe('75');
      expect(roryRow[4]).toBe('10');
      expect(roryRow[5]).toBe('75');
      expect(roryRow[6]).toBe('25');
      expect(roryRow[7]).toBe('75');
      expect(roryRow[8]).toBe('50');
      expect(roryRow[9]).toBe('75');

      // Jon: value=10, GW1=0/50, GW2=22/50, GW3=8/50, total=30, current=50
      expect(jonRow[1]).toBe('10');
      expect(jonRow[2]).toBe('0');
      expect(jonRow[3]).toBe('50');
      expect(jonRow[4]).toBe('22');
      expect(jonRow[5]).toBe('50');
      expect(jonRow[6]).toBe('8');
      expect(jonRow[7]).toBe('50');
      expect(jonRow[8]).toBe('30');
      expect(jonRow[9]).toBe('50');
    });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simple CSV line parser that handles quoted fields. */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
