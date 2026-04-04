import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { calculatePickPoints } from './scoring';
import type { TimeBoundaries } from './scoring';
import type { ScoreDocument } from '../models/Score';

function makeScore(
  golferId: ObjectId,
  tournamentId: ObjectId,
  multipliedPoints: number,
): ScoreDocument {
  return {
    _id: new ObjectId(),
    golferId,
    tournamentId,
    participated: true,
    position: 1,
    rawScore: -5,
    basePoints: 10,
    bonusPoints: 5,
    multipliedPoints,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildScoreLookup(
  scores: ScoreDocument[],
): Map<string, Map<string, ScoreDocument>> {
  const map = new Map<string, Map<string, ScoreDocument>>();
  for (const score of scores) {
    const gid = score.golferId.toString();
    if (!map.has(gid)) map.set(gid, new Map());
    map.get(gid)!.set(score.tournamentId.toString(), score);
  }
  return map;
}

const golfer1 = new ObjectId();
const golfer2 = new ObjectId();
const captainId = golfer1;
const tournament1 = new ObjectId();
const tournament2 = new ObjectId();

const defaultBoundaries: TimeBoundaries = {
  weekStart: new Date('2024-06-01'),
  weekEnd: new Date('2024-06-07T23:59:59.999Z'),
  monthStart: new Date('2024-06-01'),
  monthEnd: new Date('2024-06-30T23:59:59.999Z'),
  seasonStart: new Date('2024-01-01'),
};

describe('calculatePickPoints', () => {
  it('applies captain 2x multiplier', () => {
    const scores = [
      makeScore(golfer1, tournament1, 10), // captain
      makeScore(golfer2, tournament1, 10), // non-captain
    ];

    const result = calculatePickPoints(
      { golferIds: [golfer1, golfer2], captainId, createdAt: new Date('2024-01-01') },
      buildScoreLookup(scores),
      new Map([[tournament1.toString(), new Date('2024-06-03')]]),
      defaultBoundaries,
    );

    // Captain gets 2x (20), non-captain gets 1x (10) = 30 total
    expect(result.weekPoints).toBe(30);
    expect(result.seasonPoints).toBe(30);
  });

  it('excludes tournaments after weekEnd', () => {
    const scores = [makeScore(golfer1, tournament1, 10)];

    const result = calculatePickPoints(
      { golferIds: [golfer1], createdAt: new Date('2024-01-01') },
      buildScoreLookup(scores),
      // Tournament is June 15 — after weekEnd (June 7)
      new Map([[tournament1.toString(), new Date('2024-06-15')]]),
      defaultBoundaries,
    );

    expect(result.weekPoints).toBe(0);
    // Still in month and season
    expect(result.monthPoints).toBe(10);
    expect(result.seasonPoints).toBe(10);
  });

  it('excludes tournaments after monthEnd', () => {
    const scores = [makeScore(golfer1, tournament1, 10)];

    const result = calculatePickPoints(
      { golferIds: [golfer1], createdAt: new Date('2024-01-01') },
      buildScoreLookup(scores),
      // Tournament is July 5 — after monthEnd (June 30)
      new Map([[tournament1.toString(), new Date('2024-07-05')]]),
      defaultBoundaries,
    );

    expect(result.weekPoints).toBe(0);
    expect(result.monthPoints).toBe(0);
    // Still in season
    expect(result.seasonPoints).toBe(10);
  });

  it('filters by team effective start date', () => {
    const scores = [
      makeScore(golfer1, tournament1, 10),
      makeScore(golfer1, tournament2, 20),
    ];

    const result = calculatePickPoints(
      // Team created June 5 (Wed) — getTeamEffectiveStartDate returns next Saturday Jun 8.
      // Tournament1 on June 2 is before that, tournament2 on June 9 is after.
      { golferIds: [golfer1], createdAt: new Date('2024-06-05') },
      buildScoreLookup(scores),
      new Map([
        [tournament1.toString(), new Date('2024-06-02')],
        [tournament2.toString(), new Date('2024-06-09')],
      ]),
      {
        ...defaultBoundaries,
        weekStart: new Date('2024-06-01'),
        weekEnd: new Date('2024-06-14T23:59:59.999Z'),
      },
    );

    // Only tournament2 (20) counts; tournament1 is before team effective start
    expect(result.weekPoints).toBe(20);
    expect(result.seasonPoints).toBe(20);
  });

  it('handles pick with no captain', () => {
    const scores = [makeScore(golfer1, tournament1, 10)];

    const result = calculatePickPoints(
      { golferIds: [golfer1], captainId: null, createdAt: new Date('2024-01-01') },
      buildScoreLookup(scores),
      new Map([[tournament1.toString(), new Date('2024-06-03')]]),
      defaultBoundaries,
    );

    // No captain = no 2x multiplier
    expect(result.weekPoints).toBe(10);
  });

  it('handles pick with no matching scores', () => {
    const result = calculatePickPoints(
      { golferIds: [golfer1], createdAt: new Date('2024-01-01') },
      new Map(),
      new Map(),
      defaultBoundaries,
    );

    expect(result.weekPoints).toBe(0);
    expect(result.monthPoints).toBe(0);
    expect(result.seasonPoints).toBe(0);
  });
});
