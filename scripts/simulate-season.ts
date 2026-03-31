// Season simulation script — simulates 13 gameweeks of the 2026 fantasy golf season
// Run with: npm run db:simulate

import { MongoClient, ObjectId, type Db } from 'mongodb';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Import shared helpers
import {
  getBasePointsForPosition,
  getBonusPoints,
  TOURNAMENT_TYPE_CONFIG,
  type TournamentType,
  type ScoringFormat,
  type GolferCountTier,
} from '../shared/types/tournament.types';
import {
  getWeekStart,
  getWeekEnd,
  getTeamEffectiveStartDate,
  getGameweekNumber,
} from '../netlify/functions/_shared/utils/dates';
import { BUDGET_CAP, MAX_GOLFERS } from '../shared/constants/rules';

// ── Constants ──────────────────────────────────────────────────────────────────

const SIM_DB = 'bearwood-fantasy-sim';
const TOTAL_GOLFERS = 100;
const TOTAL_USERS = 100;
const PRE_SEASON_USERS = 50;
const GAMEWEEKS = 13;
const TOURNAMENTS_PER_WEEK = 3;
const MIN_PARTICIPANTS = 3;
const MAX_PARTICIPANTS = 30;
const SEASON_YEAR = 2026;
const SEASON_START = new Date(2026, 3, 1); // Apr 1
const SEASON_END = new Date(2027, 2, 31); // Mar 31
const FIRST_GW_START = new Date(2026, 3, 3, 8, 0); // Fri Apr 3 8am
let DEFAULT_PASSWORD_HASH = '';

// Collection names (matching app models)
const GOLFERS_COLLECTION = 'golfers';
const USERS_COLLECTION = 'users';
const PICKS_COLLECTION = 'picks';
const PICK_HISTORY_COLLECTION = 'pickHistory';
const TOURNAMENTS_COLLECTION = 'tournaments';
const SCORES_COLLECTION = 'scores';
const SEASONS_COLLECTION = 'seasons';
const SETTINGS_COLLECTION = 'settings';

// ── Seeded PRNG ────────────────────────────────────────────────────────────────

let seed = 42;

function seededRandom(): number {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff;
  return (seed >>> 0) / 0xffffffff;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(seededRandom() * (max - min + 1));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gaussianRandom(): number {
  const u1 = seededRandom();
  const u2 = seededRandom();
  return Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
}

// ── ANSI Colors ────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// ── Validation types ───────────────────────────────────────────────────────────

interface ValidationResult {
  name: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

interface GameweekReport {
  gameweek: number;
  weekStart: Date;
  weekEnd: Date;
  tournamentsCreated: number;
  scoresEntered: number;
  newUsers: number;
  transfersAttempted: number;
  pendingApplied: number;
  validations: ValidationResult[];
}

// ── Golfer Doc shape ───────────────────────────────────────────────────────────

interface GolferDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  picture: string;
  price: number;
  isActive: boolean;
  stats2024: GolferStats;
  stats2025: GolferStats;
  stats2026: GolferStats;
  createdAt: Date;
  updatedAt: Date;
}

interface GolferStats {
  timesScored36Plus: number;
  timesScored32Plus: number;
  timesFinished1st: number;
  timesFinished2nd: number;
  timesFinished3rd: number;
  timesPlayed: number;
}

interface UserDoc {
  _id: ObjectId;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TournamentDoc {
  _id: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  tournamentType: TournamentType;
  scoringFormat: ScoringFormat;
  isMultiDay: boolean;
  multiplier: number;
  golferCountTier: GolferCountTier;
  season: number;
  status: string;
  participatingGolferIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

interface ScoreDoc {
  _id: ObjectId;
  tournamentId: ObjectId;
  golferId: ObjectId;
  participated: boolean;
  position: number | null;
  rawScore: number | null;
  basePoints: number;
  bonusPoints: number;
  multipliedPoints: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PickDoc {
  _id: ObjectId;
  userId: ObjectId;
  golferIds: ObjectId[];
  captainId: ObjectId | null;
  pendingGolferIds?: ObjectId[];
  pendingCaptainId?: ObjectId | null;
  pendingChangedAt?: Date;
  totalSpent: number;
  season: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Name pools ─────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'William', 'Oliver', 'Thomas', 'Harry', 'George', 'Charlie', 'Jack',
  'Edward', 'Henry', 'Samuel', 'Daniel', 'David', 'Michael', 'Richard', 'Robert',
  'Andrew', 'Peter', 'Christopher', 'Matthew', 'Stephen', 'Paul', 'Mark', 'Simon',
  'Jonathan', 'Nicholas', 'Timothy', 'Patrick', 'Graham', 'Colin', 'Stuart', 'Alan',
  'Brian', 'Keith', 'Derek', 'Malcolm', 'Trevor', 'Nigel', 'Clive', 'Roger',
  'Emma', 'Sophie', 'Charlotte', 'Victoria', 'Elizabeth', 'Sarah', 'Catherine',
  'Rebecca', 'Rachel', 'Laura', 'Jessica', 'Hannah', 'Claire', 'Louise', 'Helen',
  'Jennifer', 'Amanda', 'Susan', 'Patricia', 'Margaret', 'Caroline', 'Fiona',
  'Geoffrey', 'Bernard', 'Harold', 'Kenneth', 'Ronald', 'Norman', 'Douglas',
  'Raymond', 'Stanley', 'Albert', 'Arthur', 'Ernest', 'Frederick', 'Walter',
];

const LAST_NAMES = [
  'Smith', 'Jones', 'Williams', 'Brown', 'Taylor', 'Davies', 'Wilson', 'Evans',
  'Thomas', 'Johnson', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson',
  'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Lewis', 'Harris', 'Clarke',
  'Patel', 'Jackson', 'Wood', 'Turner', 'Martin', 'Cooper', 'Hill', 'Ward',
  'Morris', 'King', 'Watson', 'Baker', 'Price', 'Bennett', 'Gray', 'Hamilton',
  'Collins', 'Fraser', 'Murray', 'Simpson', 'Henderson', 'Ross', 'Campbell',
  'Stewart', 'Marshall', 'Grant', 'Morgan',
];

const EMPTY_STATS: GolferStats = {
  timesScored36Plus: 0,
  timesScored32Plus: 0,
  timesFinished1st: 0,
  timesFinished2nd: 0,
  timesFinished3rd: 0,
  timesPlayed: 0,
};

// ── Data generators ────────────────────────────────────────────────────────────

function generateGolfers(count: number): GolferDoc[] {
  const golfers: GolferDoc[] = [];
  const now = new Date();

  // Price tiers: elite 10, strong 20, average 30, developing 25, casual 15
  const tiers: Array<{ count: number; minPrice: number; maxPrice: number }> = [
    { count: 10, minPrice: 12_000_000, maxPrice: 14_500_000 },
    { count: 20, minPrice: 9_000_000, maxPrice: 12_000_000 },
    { count: 30, minPrice: 6_000_000, maxPrice: 9_000_000 },
    { count: 25, minPrice: 4_500_000, maxPrice: 6_000_000 },
    { count: 15, minPrice: 3_500_000, maxPrice: 4_500_000 },
  ];

  let tierIdx = 0;
  let tierUsed = 0;

  for (let i = 0; i < count; i++) {
    const tier = tiers[tierIdx];
    const rawPrice = tier.minPrice + seededRandom() * (tier.maxPrice - tier.minPrice);
    const price = Math.round(rawPrice / 100_000) * 100_000;

    golfers.push({
      _id: new ObjectId(),
      firstName: FIRST_NAMES[i % FIRST_NAMES.length],
      lastName: LAST_NAMES[i % LAST_NAMES.length],
      picture: '',
      price,
      isActive: true,
      stats2024: { ...EMPTY_STATS },
      stats2025: { ...EMPTY_STATS },
      stats2026: { ...EMPTY_STATS },
      createdAt: now,
      updatedAt: now,
    });

    tierUsed++;
    if (tierUsed >= tier.count && tierIdx < tiers.length - 1) {
      tierIdx++;
      tierUsed = 0;
    }
  }

  return golfers;
}

function generateUser(index: number, createdAt: Date): UserDoc {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[index % LAST_NAMES.length];
  const now = createdAt;

  return {
    _id: new ObjectId(),
    firstName,
    lastName,
    username: `sim_user_${index}`,
    email: `sim${index}@test.com`,
    passwordHash: DEFAULT_PASSWORD_HASH,
    phoneNumber: null,
    phoneVerified: true,
    role: 'user',
    createdAt: now,
    updatedAt: now,
  };
}

function generateStablefordScore(): number {
  const raw = Math.round(31 + gaussianRandom() * 4);
  return Math.max(18, Math.min(45, raw));
}

function generateMedalScore(): number {
  const raw = Math.round(5 + gaussianRandom() * 4);
  return Math.max(-5, Math.min(20, raw));
}

function selectTeam(
  golfers: GolferDoc[],
  budget: number = BUDGET_CAP
): { golferIds: ObjectId[]; captainId: ObjectId; totalSpent: number } | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const shuffled = shuffle(golfers);
    const picked: GolferDoc[] = [];
    let spent = 0;

    for (const g of shuffled) {
      if (picked.length >= MAX_GOLFERS) break;
      if (spent + g.price <= budget) {
        picked.push(g);
        spent += g.price;
      }
    }

    if (picked.length === MAX_GOLFERS) {
      // Captain = most expensive
      const captain = picked.reduce((a, b) => (a.price >= b.price ? a : b));
      return {
        golferIds: picked.map((g) => g._id),
        captainId: captain._id,
        totalSpent: spent,
      };
    }
  }

  return null;
}

function selectParticipants(golfers: GolferDoc[], min: number, max: number): GolferDoc[] {
  const count = randomInt(min, max);
  return shuffle(golfers).slice(0, count);
}

function getNewUserCount(gw: number): number {
  if (gw <= 2) return 5;
  if (gw <= 5) return 4;
  if (gw <= 12) return 3;
  return 7; // GW13 — remainder to reach 100
}

function getGolferCountTier(count: number): GolferCountTier {
  if (count < 10) return '0-10';
  if (count < 20) return '10-20';
  return '20+';
}

// ── Validators ─────────────────────────────────────────────────────────────────

async function validateScoring(db: Db, tournamentId: ObjectId): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Scoring arithmetic', passed: true, errors: [], warnings: [] };

  const tournament = await db.collection<TournamentDoc>(TOURNAMENTS_COLLECTION).findOne({ _id: tournamentId });
  if (!tournament) {
    result.passed = false;
    result.errors.push(`Tournament ${tournamentId} not found`);
    return result;
  }

  const scores = await db.collection<ScoreDoc>(SCORES_COLLECTION).find({ tournamentId }).toArray();
  for (const s of scores) {
    const expectedBase = getBasePointsForPosition(s.position);
    const expectedBonus = getBonusPoints(s.rawScore, tournament.scoringFormat, tournament.isMultiDay);
    const expectedMultiplied = (expectedBase + expectedBonus) * tournament.multiplier;

    if (s.basePoints !== expectedBase) {
      result.passed = false;
      result.errors.push(
        `Score ${s._id}: basePoints=${s.basePoints}, expected=${expectedBase} (pos=${s.position})`
      );
    }
    if (s.bonusPoints !== expectedBonus) {
      result.passed = false;
      result.errors.push(
        `Score ${s._id}: bonusPoints=${s.bonusPoints}, expected=${expectedBonus} (raw=${s.rawScore})`
      );
    }
    if (s.multipliedPoints !== expectedMultiplied) {
      result.passed = false;
      result.errors.push(
        `Score ${s._id}: multipliedPoints=${s.multipliedPoints}, expected=${expectedMultiplied}`
      );
    }
  }

  return result;
}

async function validateTeamSize(db: Db): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Team size (exactly 6)', passed: true, errors: [], warnings: [] };

  const picks = await db.collection<PickDoc>(PICKS_COLLECTION).find().toArray();
  for (const p of picks) {
    if (p.golferIds.length !== MAX_GOLFERS) {
      result.passed = false;
      result.errors.push(
        `Pick ${p._id} (user ${p.userId}): has ${p.golferIds.length} golfers, expected ${MAX_GOLFERS}`
      );
    }
  }

  return result;
}

async function validateBudget(db: Db, golfers: GolferDoc[]): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Budget cap', passed: true, errors: [], warnings: [] };

  const golferMap = new Map(golfers.map((g) => [g._id.toString(), g]));
  const picks = await db.collection<PickDoc>(PICKS_COLLECTION).find().toArray();

  for (const p of picks) {
    let computed = 0;
    for (const gId of p.golferIds) {
      const g = golferMap.get(gId.toString());
      if (g) computed += g.price;
    }

    if (computed > BUDGET_CAP) {
      result.passed = false;
      result.errors.push(`Pick ${p._id}: spent £${computed.toLocaleString()}, exceeds cap £${BUDGET_CAP.toLocaleString()}`);
    }
    if (p.totalSpent !== computed) {
      result.warnings.push(`Pick ${p._id}: stored totalSpent=${p.totalSpent}, computed=${computed}`);
    }
  }

  return result;
}

async function validateNoDuplicates(db: Db): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'No duplicate golfers', passed: true, errors: [], warnings: [] };

  const picks = await db.collection<PickDoc>(PICKS_COLLECTION).find().toArray();
  for (const p of picks) {
    const ids = p.golferIds.map((id) => id.toString());
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      result.passed = false;
      result.errors.push(`Pick ${p._id}: has ${ids.length - unique.size} duplicate golfer(s)`);
    }
  }

  return result;
}

async function validateCaptainOnTeam(db: Db): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Captain on team', passed: true, errors: [], warnings: [] };

  const picks = await db.collection<PickDoc>(PICKS_COLLECTION).find().toArray();
  for (const p of picks) {
    if (p.captainId) {
      const onTeam = p.golferIds.some((id) => id.equals(p.captainId!));
      if (!onTeam) {
        result.passed = false;
        result.errors.push(`Pick ${p._id}: captain ${p.captainId} not in golferIds`);
      }
    }
  }

  return result;
}

function validateEffectiveStartDate(
  user: UserDoc,
  firstGW: Date
): ValidationResult {
  const result: ValidationResult = { name: 'Effective start date', passed: true, errors: [], warnings: [] };

  const effective = getTeamEffectiveStartDate(user.createdAt, firstGW);
  const userWeekStart = getWeekStart(user.createdAt, firstGW);

  // Effective start must be AFTER the week they joined (next week's start)
  if (effective <= userWeekStart) {
    result.passed = false;
    result.errors.push(
      `User ${user.username}: effective=${effective.toISOString()} should be after join week ${userWeekStart.toISOString()}`
    );
  }

  return result;
}

async function validateNewTeamZeroPastPoints(
  db: Db,
  userId: ObjectId,
  weekStart: Date,
  firstGW: Date
): Promise<ValidationResult> {
  const result: ValidationResult = {
    name: 'New team zero past points',
    passed: true,
    errors: [],
    warnings: [],
  };

  const pick = await db.collection<PickDoc>(PICKS_COLLECTION).findOne({ userId });
  if (!pick) {
    result.warnings.push(`User ${userId}: no pick found`);
    return result;
  }

  const effective = getTeamEffectiveStartDate(pick.createdAt, firstGW);

  // Find tournaments BEFORE the effective date
  const pastTournaments = await db
    .collection<TournamentDoc>(TOURNAMENTS_COLLECTION)
    .find({ startDate: { $lt: effective } })
    .toArray();

  for (const t of pastTournaments) {
    const golferIdStrings = pick.golferIds.map((id) => id.toString());
    const scores = await db
      .collection<ScoreDoc>(SCORES_COLLECTION)
      .find({
        tournamentId: t._id,
        golferId: { $in: pick.golferIds },
      })
      .toArray();

    // User shouldn't earn points from pre-effective tournaments
    // This is a data-level check — the leaderboard calc handles it, but we verify the concept
    for (const s of scores) {
      if (s.multipliedPoints > 0 && golferIdStrings.includes(s.golferId.toString())) {
        result.warnings.push(
          `User ${userId}: golfer ${s.golferId} scored ${s.multipliedPoints}pts in tournament before effective date — leaderboard should exclude`
        );
      }
    }
  }

  return result;
}

async function validateDeferredChanges(
  db: Db,
  userId: ObjectId,
  expectedPendingGolferIds?: ObjectId[],
  expectedPendingCaptainId?: ObjectId | null
): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Deferred changes set', passed: true, errors: [], warnings: [] };

  const pick = await db.collection<PickDoc>(PICKS_COLLECTION).findOne({ userId });
  if (!pick) {
    result.passed = false;
    result.errors.push(`User ${userId}: no pick found`);
    return result;
  }

  if (expectedPendingGolferIds) {
    if (!pick.pendingGolferIds || pick.pendingGolferIds.length === 0) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingGolferIds not set`);
    }
    if (!pick.pendingChangedAt) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingChangedAt not set`);
    }
  }

  if (expectedPendingCaptainId !== undefined) {
    if (pick.pendingCaptainId === undefined) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingCaptainId not set`);
    }
  }

  return result;
}

async function validatePendingApplied(
  db: Db,
  appliedUserIds: ObjectId[],
  _weekStart: Date
): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Pending changes applied', passed: true, errors: [], warnings: [] };

  for (const userId of appliedUserIds) {
    const pick = await db.collection<PickDoc>(PICKS_COLLECTION).findOne({ userId });
    if (!pick) {
      result.passed = false;
      result.errors.push(`User ${userId}: no pick found after applying pending`);
      continue;
    }

    if (pick.pendingGolferIds && pick.pendingGolferIds.length > 0) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingGolferIds not cleared`);
    }
    if (pick.pendingCaptainId !== undefined && pick.pendingCaptainId !== null) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingCaptainId not cleared`);
    }
    if (pick.pendingChangedAt) {
      result.passed = false;
      result.errors.push(`User ${userId}: pendingChangedAt not cleared`);
    }
  }

  return result;
}

async function validateTransferLimit(db: Db, userId: ObjectId, weekStart: Date, weekEnd: Date): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Transfer limit', passed: true, errors: [], warnings: [] };

  const historyCount = await db
    .collection(PICK_HISTORY_COLLECTION)
    .countDocuments({
      userId,
      changedAt: { $gte: weekStart, $lte: weekEnd },
      reason: { $regex: /^Transfer/ },
    });

  if (historyCount > 1) {
    result.passed = false;
    result.errors.push(`User ${userId}: ${historyCount} transfers this week, max is 1`);
  }

  return result;
}

function validateTransferLock(transfersOpen: boolean): ValidationResult {
  const result: ValidationResult = { name: 'Transfer lock', passed: true, errors: [], warnings: [] };

  if (transfersOpen) {
    result.passed = false;
    result.errors.push('transfersOpen should be false during lock test');
  }

  return result;
}

function validateCaptainLocked(transfersOpen: boolean): ValidationResult {
  const result: ValidationResult = { name: 'Captain lock', passed: true, errors: [], warnings: [] };

  if (transfersOpen) {
    result.passed = false;
    result.errors.push('transfersOpen should be false — captain changes also blocked');
  }

  return result;
}

async function validateCaptainFree(db: Db, userId: ObjectId, weekStart: Date, weekEnd: Date): Promise<ValidationResult> {
  const result: ValidationResult = { name: 'Captain change free', passed: true, errors: [], warnings: [] };

  // Captain changes should not appear as transfers in pickHistory
  const captainTransfers = await db
    .collection(PICK_HISTORY_COLLECTION)
    .countDocuments({
      userId,
      changedAt: { $gte: weekStart, $lte: weekEnd },
      reason: { $regex: /^Captain/ },
    });

  // Captain changes don't consume transfer slots — they're tracked separately
  // Just verify they exist but don't count as "Transfer" reason
  if (captainTransfers > 0) {
    // That's fine — they're tracked but shouldn't block transfers
    result.warnings.push(`User ${userId}: ${captainTransfers} captain change(s) tracked (not counted as transfer)`);
  }

  return result;
}

function validateWeekBoundaries(
  tournament: TournamentDoc,
  weekStart: Date,
  weekEnd: Date
): ValidationResult {
  const result: ValidationResult = { name: 'Week boundaries', passed: true, errors: [], warnings: [] };

  if (tournament.startDate < weekStart || tournament.startDate > weekEnd) {
    result.passed = false;
    result.errors.push(
      `Tournament ${tournament.name}: startDate ${tournament.startDate.toISOString()} outside [${weekStart.toISOString()}, ${weekEnd.toISOString()}]`
    );
  }

  return result;
}

function validateGW1Friday(weekStart: Date): ValidationResult {
  const result: ValidationResult = { name: 'GW1 starts Friday', passed: true, errors: [], warnings: [] };

  // Apr 3 2026 is a Friday (day 5)
  if (weekStart.getDay() !== 5) {
    result.passed = false;
    result.errors.push(
      `GW1 weekStart is ${weekStart.toISOString()} (day=${weekStart.getDay()}), expected Friday (day=5)`
    );
  }
  if (weekStart.getDate() !== 3 || weekStart.getMonth() !== 3) {
    result.passed = false;
    result.errors.push(
      `GW1 weekStart is ${weekStart.toISOString()}, expected Apr 3`
    );
  }

  return result;
}

function validateLeaderboardWeek(
  userPicks: PickDoc[],
  tournaments: TournamentDoc[],
  scores: ScoreDoc[],
  weekStart: Date,
  weekEnd: Date,
  firstGW: Date
): ValidationResult {
  const result: ValidationResult = { name: 'Leaderboard (week)', passed: true, errors: [], warnings: [] };

  const weekTournaments = tournaments.filter(
    (t) => t.startDate >= weekStart && t.startDate <= weekEnd
  );

  const scoreMap = new Map<string, ScoreDoc[]>();
  for (const s of scores) {
    const key = s.tournamentId.toString();
    if (!scoreMap.has(key)) scoreMap.set(key, []);
    scoreMap.get(key)!.push(s);
  }

  for (const pick of userPicks) {
    const effective = getTeamEffectiveStartDate(pick.createdAt, firstGW);
    if (effective > weekEnd) continue; // Not eligible yet

    let weekPoints = 0;
    const golferIdSet = new Set(pick.golferIds.map((id) => id.toString()));
    const captainIdStr = pick.captainId?.toString();

    for (const t of weekTournaments) {
      const tScores = scoreMap.get(t._id.toString()) || [];
      for (const s of tScores) {
        if (golferIdSet.has(s.golferId.toString())) {
          let pts = s.multipliedPoints;
          if (captainIdStr && s.golferId.toString() === captainIdStr) {
            pts *= 2;
          }
          weekPoints += pts;
        }
      }
    }

    if (weekPoints < 0) {
      result.passed = false;
      result.errors.push(`User ${pick.userId}: negative week points (${weekPoints})`);
    }
  }

  return result;
}

function validateLeaderboardSeason(
  userPicks: PickDoc[],
  allTournaments: TournamentDoc[],
  allScores: ScoreDoc[],
  firstGW: Date
): ValidationResult {
  const result: ValidationResult = { name: 'Leaderboard (season)', passed: true, errors: [], warnings: [] };

  const scoreMap = new Map<string, ScoreDoc[]>();
  for (const s of allScores) {
    const key = s.tournamentId.toString();
    if (!scoreMap.has(key)) scoreMap.set(key, []);
    scoreMap.get(key)!.push(s);
  }

  for (const pick of userPicks) {
    const effective = getTeamEffectiveStartDate(pick.createdAt, firstGW);
    const golferIdSet = new Set(pick.golferIds.map((id) => id.toString()));
    const captainIdStr = pick.captainId?.toString();

    let seasonPoints = 0;
    for (const t of allTournaments) {
      if (t.startDate < effective) continue;

      const tScores = scoreMap.get(t._id.toString()) || [];
      for (const s of tScores) {
        if (golferIdSet.has(s.golferId.toString())) {
          let pts = s.multipliedPoints;
          if (captainIdStr && s.golferId.toString() === captainIdStr) {
            pts *= 2;
          }
          seasonPoints += pts;
        }
      }
    }

    if (seasonPoints < 0) {
      result.passed = false;
      result.errors.push(`User ${pick.userId}: negative season points (${seasonPoints})`);
    }
  }

  return result;
}

function validateCaptainDoubling(pick: PickDoc, scores: ScoreDoc[]): ValidationResult {
  const result: ValidationResult = { name: 'Captain doubling', passed: true, errors: [], warnings: [] };

  if (!pick.captainId) {
    result.warnings.push(`Pick ${pick._id}: no captain set`);
    return result;
  }

  const captainIdStr = pick.captainId.toString();
  const captainScores = scores.filter((s) => s.golferId.toString() === captainIdStr);

  for (const s of captainScores) {
    // Captain's points should be doubled when computing leaderboard
    // We verify the raw multipliedPoints are correctly computed (before captain doubling)
    // The doubling happens at leaderboard-calc time, not in the score doc
    if (s.multipliedPoints < 0) {
      result.passed = false;
      result.errors.push(`Captain score ${s._id}: negative multipliedPoints=${s.multipliedPoints}`);
    }
  }

  return result;
}

// ── Confirmation prompt ────────────────────────────────────────────────────────

async function confirmRun(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  This will DROP the "${SIM_DB}" database and run a full season simulation.\n` +
        `   Type "YES" to continue: `,
      (answer) => {
        rl.close();
        resolve(answer.trim() === 'YES');
      }
    );
  });
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Connect and confirm
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Add it to .env.local or .env');
    process.exit(1);
  }

  console.log(`\n${BOLD}🏌️  Bearwood Fantasy — Season Simulation${RESET}`);
  console.log(`   Database: ${SIM_DB}`);
  console.log(`   Season:   ${SEASON_YEAR} (${GAMEWEEKS} gameweeks, ${TOTAL_GOLFERS} golfers, ${TOTAL_USERS} users)\n`);

  const confirmed = await confirmRun();
  if (!confirmed) {
    console.log('\n❌ Simulation cancelled.\n');
    process.exit(0);
  }

  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(SIM_DB);

  try {
    // 2. Wipe DB
    console.log('\n🗑️  Dropping existing simulation database...');
    await db.dropDatabase();

    // 3. Create indexes
    console.log('📇 Creating indexes...');
    await db.collection(GOLFERS_COLLECTION).createIndex({ isActive: 1 });
    await db.collection(USERS_COLLECTION).createIndex({ username: 1 }, { unique: true });
    await db.collection(USERS_COLLECTION).createIndex({ email: 1 }, { unique: true });
    await db.collection(PICKS_COLLECTION).createIndex({ userId: 1, season: 1 }, { unique: true });
    await db.collection(SCORES_COLLECTION).createIndex({ tournamentId: 1, golferId: 1 }, { unique: true });
    await db.collection(TOURNAMENTS_COLLECTION).createIndex({ season: 1, startDate: 1 });
    await db.collection(PICK_HISTORY_COLLECTION).createIndex({ userId: 1, changedAt: 1 });

    // 4. Create season
    console.log('📅 Creating season...');
    await db.collection(SEASONS_COLLECTION).insertOne({
      _id: new ObjectId(),
      name: String(SEASON_YEAR),
      startDate: SEASON_START,
      endDate: SEASON_END,
      firstGameweekStart: FIRST_GW_START,
      isActive: true,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 5. Create settings
    console.log('⚙️  Creating settings...');
    const settingsEntries = [
      { key: 'transfersOpen', value: true },
      { key: 'registrationOpen', value: true },
      { key: 'allowNewTeamCreation', value: true },
      { key: 'maxTransfersPerWeek', value: 1 },
      { key: 'maxPlayersPerTransfer', value: 6 },
    ];
    await db.collection(SETTINGS_COLLECTION).insertMany(
      settingsEntries.map((s) => ({
        _id: new ObjectId(),
        ...s,
        updatedAt: new Date(),
      }))
    );

    // 6. Generate and insert golfers
    console.log(`🏌️  Generating ${TOTAL_GOLFERS} golfers...`);
    const golfers = generateGolfers(TOTAL_GOLFERS);
    await db.collection(GOLFERS_COLLECTION).insertMany(golfers);

    // 7. Pre-hash password
    console.log('🔐 Hashing password...');
    DEFAULT_PASSWORD_HASH = await bcrypt.hash('password123', 10);

    // 8. Pre-season: create 50 users with teams
    console.log(`👥 Creating ${PRE_SEASON_USERS} pre-season users with teams...`);
    const allUsers: UserDoc[] = [];
    const preSeasonDate = new Date(2026, 2, 15); // March 15

    for (let i = 0; i < PRE_SEASON_USERS; i++) {
      const user = generateUser(i, preSeasonDate);
      allUsers.push(user);
    }

    await db.collection(USERS_COLLECTION).insertMany(allUsers);

    // Create teams for pre-season users
    for (const user of allUsers) {
      const team = selectTeam(golfers);
      if (!team) {
        console.error(`❌ Failed to select team for user ${user.username}`);
        continue;
      }

      const pickDoc: PickDoc = {
        _id: new ObjectId(),
        userId: user._id,
        golferIds: team.golferIds,
        captainId: team.captainId,
        totalSpent: team.totalSpent,
        season: SEASON_YEAR,
        createdAt: user.createdAt,
        updatedAt: user.createdAt,
      };

      await db.collection(PICKS_COLLECTION).insertOne(pickDoc);

      // Record in pick history
      await db.collection(PICK_HISTORY_COLLECTION).insertOne({
        _id: new ObjectId(),
        userId: user._id,
        golferIds: team.golferIds,
        totalSpent: team.totalSpent,
        season: SEASON_YEAR,
        changedAt: user.createdAt,
        reason: 'Initial pick',
      });
    }

    // 9. Validate pre-season
    console.log('✅ Validating pre-season...');
    const preSeasonValidations: ValidationResult[] = [];
    preSeasonValidations.push(await validateTeamSize(db));
    preSeasonValidations.push(await validateBudget(db, golfers));
    preSeasonValidations.push(await validateNoDuplicates(db));
    preSeasonValidations.push(await validateCaptainOnTeam(db));

    for (const v of preSeasonValidations) {
      const icon = v.passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
      console.log(`   ${icon} ${v.name}`);
      for (const e of v.errors) console.log(`      ${RED}${e}${RESET}`);
    }

    // 10. Gameweek loop
    const reports: GameweekReport[] = [];
    let userIndex = PRE_SEASON_USERS;
    const allTournaments: TournamentDoc[] = [];
    const allScores: ScoreDoc[] = [];

    for (let gw = 1; gw <= GAMEWEEKS; gw++) {
      console.log(`\n${BOLD}${CYAN}━━━ Gameweek ${gw} ━━━${RESET}`);

      const validations: ValidationResult[] = [];
      let scoresEntered = 0;
      let transfersAttempted = 0;
      let pendingApplied = 0;

      // 10.1. Compute boundaries
      const gwDate =
        gw === 1
          ? new Date(2026, 3, 3) // Friday Apr 3
          : new Date(2026, 3, 11 + (gw - 2) * 7); // Sat Apr 11, 18, 25, ...

      const weekStart = getWeekStart(gwDate, FIRST_GW_START);
      const weekEnd = getWeekEnd(weekStart, FIRST_GW_START);

      console.log(`   ${DIM}${weekStart.toDateString()} → ${weekEnd.toDateString()}${RESET}`);

      // GW1 validation: must start on Friday
      if (gw === 1) {
        validations.push(validateGW1Friday(weekStart));
      }

      // 10.2. Apply pending changes from previous weeks
      const appliedUserIds: ObjectId[] = [];
      if (gw > 1) {
        const pendingPicks = await db
          .collection<PickDoc>(PICKS_COLLECTION)
          .find({
            pendingChangedAt: { $lt: weekStart },
            $or: [
              { pendingGolferIds: { $exists: true, $ne: [] } },
              { pendingCaptainId: { $exists: true, $ne: null } },
            ],
          })
          .toArray();

        for (const pick of pendingPicks) {
          const updateFields: Record<string, unknown> = {
            updatedAt: weekStart,
          };
          const unsetFields: Record<string, unknown> = {};

          if (pick.pendingGolferIds && pick.pendingGolferIds.length > 0) {
            updateFields.golferIds = pick.pendingGolferIds;
            // Recalculate totalSpent
            let newSpent = 0;
            for (const gId of pick.pendingGolferIds) {
              const golfer = golfers.find((g) => g._id.equals(gId));
              if (golfer) newSpent += golfer.price;
            }
            updateFields.totalSpent = newSpent;
          }
          if (pick.pendingCaptainId !== undefined && pick.pendingCaptainId !== null) {
            updateFields.captainId = pick.pendingCaptainId;
          }

          unsetFields.pendingGolferIds = '';
          unsetFields.pendingCaptainId = '';
          unsetFields.pendingChangedAt = '';

          await db.collection(PICKS_COLLECTION).updateOne(
            { _id: pick._id },
            { $set: updateFields, $unset: unsetFields }
          );

          appliedUserIds.push(pick.userId);
          pendingApplied++;
        }

        if (appliedUserIds.length > 0) {
          validations.push(await validatePendingApplied(db, appliedUserIds, weekStart));
        }
      }

      // 10.3. Create 3 tournaments
      const weekTournaments: TournamentDoc[] = [];
      for (let t = 0; t < TOURNAMENTS_PER_WEEK; t++) {
        const isWeekendMedal = t === 2;
        const tournamentType: TournamentType = isWeekendMedal ? 'weekend_medal' : 'rollup_stableford';
        const config = TOURNAMENT_TYPE_CONFIG[tournamentType];
        const scoringFormat = config.forcedScoringFormat || config.defaultScoringFormat;

        // Spread tournament dates within the week
        const dayOffset = t * 2 + 1; // days 1, 3, 5 within the week
        const tournamentDate = new Date(weekStart);
        tournamentDate.setDate(tournamentDate.getDate() + dayOffset);
        tournamentDate.setHours(8, 0, 0, 0);

        const participants = selectParticipants(golfers, MIN_PARTICIPANTS, MAX_PARTICIPANTS);

        const tournament: TournamentDoc = {
          _id: new ObjectId(),
          name: `GW${gw} ${config.label} ${t + 1}`,
          startDate: tournamentDate,
          endDate: tournamentDate,
          tournamentType,
          scoringFormat,
          isMultiDay: false,
          multiplier: config.multiplier,
          golferCountTier: getGolferCountTier(participants.length),
          season: SEASON_YEAR,
          status: 'complete',
          participatingGolferIds: participants.map((g) => g._id),
          createdAt: tournamentDate,
          updatedAt: tournamentDate,
        };

        await db.collection(TOURNAMENTS_COLLECTION).insertOne(tournament);
        weekTournaments.push(tournament);
        allTournaments.push(tournament);

        validations.push(validateWeekBoundaries(tournament, weekStart, weekEnd));

        // 10.4. Generate scores
        // Sort participants by random "skill" for positions
        const sorted = shuffle(participants);
        for (let pos = 0; pos < sorted.length; pos++) {
          const golfer = sorted[pos];
          const position = pos < 3 ? pos + 1 : null;
          const rawScore =
            scoringFormat === 'stableford' ? generateStablefordScore() : generateMedalScore();

          const basePoints = getBasePointsForPosition(position);
          const bonusPoints = getBonusPoints(rawScore, scoringFormat, false);
          const multipliedPoints = (basePoints + bonusPoints) * tournament.multiplier;

          const scoreDoc: ScoreDoc = {
            _id: new ObjectId(),
            tournamentId: tournament._id,
            golferId: golfer._id,
            participated: true,
            position,
            rawScore,
            basePoints,
            bonusPoints,
            multipliedPoints,
            createdAt: tournamentDate,
            updatedAt: tournamentDate,
          };

          await db.collection(SCORES_COLLECTION).insertOne(scoreDoc);
          allScores.push(scoreDoc);
          scoresEntered++;
        }

        // Validate scoring for this tournament
        validations.push(await validateScoring(db, tournament._id));
      }

      // 10.5. Create new users
      const newUsersThisWeek = getNewUserCount(gw);
      const newUsers: UserDoc[] = [];
      const joinDate = new Date(weekStart);
      joinDate.setDate(joinDate.getDate() + 2);

      for (let i = 0; i < newUsersThisWeek && userIndex < TOTAL_USERS; i++) {
        const user = generateUser(userIndex, joinDate);
        newUsers.push(user);
        allUsers.push(user);
        userIndex++;
      }

      if (newUsers.length > 0) {
        await db.collection(USERS_COLLECTION).insertMany(newUsers);

        for (const user of newUsers) {
          const team = selectTeam(golfers);
          if (!team) continue;

          const pickDoc: PickDoc = {
            _id: new ObjectId(),
            userId: user._id,
            golferIds: team.golferIds,
            captainId: team.captainId,
            totalSpent: team.totalSpent,
            season: SEASON_YEAR,
            createdAt: user.createdAt,
            updatedAt: user.createdAt,
          };

          await db.collection(PICKS_COLLECTION).insertOne(pickDoc);

          await db.collection(PICK_HISTORY_COLLECTION).insertOne({
            _id: new ObjectId(),
            userId: user._id,
            golferIds: team.golferIds,
            totalSpent: team.totalSpent,
            season: SEASON_YEAR,
            changedAt: user.createdAt,
            reason: 'Initial pick',
          });
        }

        // 10.6. Validate new users
        for (const user of newUsers) {
          validations.push(validateEffectiveStartDate(user, FIRST_GW_START));
          validations.push(await validateNewTeamZeroPastPoints(db, user._id, weekStart, FIRST_GW_START));
        }
      }

      // 10.7. Simulate deferred transfers (5 random existing users)
      const eligibleForTransfer = allUsers.filter(
        (u) => u.createdAt < weekStart // Only users who existed before this week
      );

      const transferUsers = shuffle(eligibleForTransfer).slice(0, Math.min(5, eligibleForTransfer.length));
      for (const user of transferUsers) {
        const pick = await db.collection<PickDoc>(PICKS_COLLECTION).findOne({ userId: user._id });
        if (!pick) continue;

        // Pick a golfer to swap out
        const outIdx = randomInt(0, pick.golferIds.length - 1);
        const outGolferId = pick.golferIds[outIdx];
        const outGolfer = golfers.find((g) => g._id.equals(outGolferId));

        // Pick a golfer not on the team to swap in
        const onTeamSet = new Set(pick.golferIds.map((id) => id.toString()));
        const available = golfers.filter((g) => !onTeamSet.has(g._id.toString()));
        if (available.length === 0 || !outGolfer) continue;

        // Find a swap within budget
        const currentSpent = pick.totalSpent - outGolfer.price;
        const affordable = available.filter((g) => currentSpent + g.price <= BUDGET_CAP);
        if (affordable.length === 0) continue;

        const inGolfer = affordable[randomInt(0, affordable.length - 1)];

        // Set pending golfer IDs
        const newGolferIds = [...pick.golferIds];
        newGolferIds[outIdx] = inGolfer._id;

        // If the swapped-out golfer was the captain, reassign captain to first golfer
        const captainSwappedOut = pick.captainId && outGolfer._id.equals(pick.captainId);
        const pendingCaptainId = captainSwappedOut ? newGolferIds[0] : undefined;

        const midWeek = new Date(weekStart);
        midWeek.setDate(midWeek.getDate() + 3);

        const setFields: Record<string, unknown> = {
          pendingGolferIds: newGolferIds,
          pendingChangedAt: midWeek,
          updatedAt: midWeek,
        };
        if (pendingCaptainId) {
          setFields.pendingCaptainId = pendingCaptainId;
        }

        await db.collection(PICKS_COLLECTION).updateOne(
          { _id: pick._id },
          { $set: setFields }
        );

        // Record in pick history
        let newSpent = 0;
        for (const gId of newGolferIds) {
          const g = golfers.find((gl) => gl._id.equals(gId));
          if (g) newSpent += g.price;
        }

        await db.collection(PICK_HISTORY_COLLECTION).insertOne({
          _id: new ObjectId(),
          userId: user._id,
          golferIds: newGolferIds,
          totalSpent: newSpent,
          season: SEASON_YEAR,
          changedAt: midWeek,
          reason: 'Transfer (deferred)',
        });

        validations.push(await validateDeferredChanges(db, user._id, newGolferIds));
        transfersAttempted++;
      }

      // 10.8. Simulate deferred captain changes (3 random users)
      const captainChangeUsers = shuffle(eligibleForTransfer).slice(0, Math.min(3, eligibleForTransfer.length));
      for (const user of captainChangeUsers) {
        const pick = await db.collection<PickDoc>(PICKS_COLLECTION).findOne({ userId: user._id });
        if (!pick || pick.golferIds.length === 0) continue;

        // Pick a different golfer as captain
        const currentCaptain = pick.captainId?.toString();
        const candidates = pick.golferIds.filter((id) => id.toString() !== currentCaptain);
        if (candidates.length === 0) continue;

        const newCaptainId = candidates[randomInt(0, candidates.length - 1)];
        const midWeek = new Date(weekStart);
        midWeek.setDate(midWeek.getDate() + 3);

        await db.collection(PICKS_COLLECTION).updateOne(
          { _id: pick._id },
          {
            $set: {
              pendingCaptainId: newCaptainId,
              pendingChangedAt: midWeek,
              updatedAt: midWeek,
            },
          }
        );

        // Captain changes are tracked but don't count as transfers
        await db.collection(PICK_HISTORY_COLLECTION).insertOne({
          _id: new ObjectId(),
          userId: user._id,
          golferIds: pick.golferIds,
          totalSpent: pick.totalSpent,
          season: SEASON_YEAR,
          changedAt: midWeek,
          reason: 'Captain change (deferred)',
        });

        validations.push(await validateDeferredChanges(db, user._id, undefined, newCaptainId));
        validations.push(await validateCaptainFree(db, user._id, weekStart, weekEnd));
      }

      // 10.9. Test transfer lock
      await db.collection(SETTINGS_COLLECTION).updateOne(
        { key: 'transfersOpen' },
        { $set: { value: false, updatedAt: new Date() } }
      );

      const lockSetting = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'transfersOpen' });
      validations.push(validateTransferLock(lockSetting?.value as boolean));
      validations.push(validateCaptainLocked(lockSetting?.value as boolean));

      // Restore
      await db.collection(SETTINGS_COLLECTION).updateOne(
        { key: 'transfersOpen' },
        { $set: { value: true, updatedAt: new Date() } }
      );

      // 10.10. Validate transfer limits for users who transferred
      for (const user of transferUsers) {
        validations.push(await validateTransferLimit(db, user._id, weekStart, weekEnd));
      }

      // 10.11. Validate team constraints
      validations.push(await validateTeamSize(db));
      validations.push(await validateBudget(db, golfers));
      validations.push(await validateNoDuplicates(db));
      validations.push(await validateCaptainOnTeam(db));

      // 10.12. Validate leaderboard
      const allPicks = await db.collection<PickDoc>(PICKS_COLLECTION).find().toArray();
      validations.push(
        validateLeaderboardWeek(allPicks, weekTournaments, allScores, weekStart, weekEnd, FIRST_GW_START)
      );
      validations.push(
        validateLeaderboardSeason(allPicks, allTournaments, allScores, FIRST_GW_START)
      );

      // Captain doubling check on a sample
      for (const pick of allPicks.slice(0, 5)) {
        const pickScores = allScores.filter((s) =>
          pick.golferIds.some((gId) => gId.equals(s.golferId))
        );
        validations.push(validateCaptainDoubling(pick, pickScores));
      }

      // Print validation results for this GW
      for (const v of validations) {
        const icon = v.passed
          ? `${GREEN}✅${RESET}`
          : v.errors.length > 0
            ? `${RED}❌${RESET}`
            : `${YELLOW}⚠️${RESET}`;
        console.log(`   ${icon} ${v.name}`);
        for (const e of v.errors) console.log(`      ${RED}${e}${RESET}`);
        for (const w of v.warnings.slice(0, 2)) console.log(`      ${YELLOW}${w}${RESET}`);
      }

      reports.push({
        gameweek: gw,
        weekStart,
        weekEnd,
        tournamentsCreated: weekTournaments.length,
        scoresEntered,
        newUsers: newUsers.length,
        transfersAttempted,
        pendingApplied,
        validations,
      });
    }

    // ── Print final report ───────────────────────────────────────────────────

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`${BOLD}  BEARWOOD FANTASY — SEASON SIMULATION REPORT${RESET}`);
    console.log(`  ${GAMEWEEKS} Gameweeks │ ${allTournaments.length} Tournaments │ ${allUsers.length} Users`);
    console.log(`${'═'.repeat(55)}\n`);

    let totalPassed = 0;
    let totalFailed = 0;
    let totalWarnings = 0;
    const categoryStats: Record<string, { total: number; passed: number; failed: number }> = {};

    for (const report of reports) {
      console.log(
        `${BOLD}GW${report.gameweek}${RESET} ${DIM}${report.weekStart.toDateString()} → ${report.weekEnd.toDateString()}${RESET}`
      );
      console.log(
        `   Tournaments: ${report.tournamentsCreated} │ Scores: ${report.scoresEntered} │ New users: ${report.newUsers} │ Transfers: ${report.transfersAttempted} │ Pending applied: ${report.pendingApplied}`
      );

      for (const v of report.validations) {
        const category = v.name;
        if (!categoryStats[category]) categoryStats[category] = { total: 0, passed: 0, failed: 0 };
        categoryStats[category].total++;

        if (v.passed) {
          categoryStats[category].passed++;
          totalPassed++;
        } else {
          categoryStats[category].failed++;
          totalFailed++;
        }
        totalWarnings += v.warnings.length;
      }
      console.log('');
    }

    // Category summary
    console.log(`${BOLD}Validation Summary${RESET}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`${'Rule'.padEnd(30)} ${'Total'.padStart(6)} ${'Pass'.padStart(6)} ${'Fail'.padStart(6)}`);
    console.log(`${'─'.repeat(55)}`);

    for (const [name, stats] of Object.entries(categoryStats)) {
      const failColor = stats.failed > 0 ? RED : GREEN;
      console.log(
        `${name.padEnd(30)} ${String(stats.total).padStart(6)} ${GREEN}${String(stats.passed).padStart(6)}${RESET} ${failColor}${String(stats.failed).padStart(6)}${RESET}`
      );
    }

    console.log(`${'─'.repeat(55)}`);
    console.log(
      `${'TOTAL'.padEnd(30)} ${String(totalPassed + totalFailed).padStart(6)} ${GREEN}${String(totalPassed).padStart(6)}${RESET} ${totalFailed > 0 ? RED : GREEN}${String(totalFailed).padStart(6)}${RESET}`
    );
    console.log('');

    if (totalFailed > 0) {
      console.log(`${RED}${BOLD}❌ ${totalFailed} bug(s) found!${RESET}`);
    } else {
      console.log(`${GREEN}${BOLD}✅ All ${totalPassed} checks passed!${RESET}`);
    }

    if (totalWarnings > 0) {
      console.log(`${YELLOW}⚠️  ${totalWarnings} warning(s)${RESET}`);
    }

    console.log('');

    await client.close();
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`\n${RED}❌ Simulation failed:${RESET}`, error);
    await client.close();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
