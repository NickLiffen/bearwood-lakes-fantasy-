import { handler } from './scheduled-recalculate';

const mockToArray = vi.fn();
const mockFind = vi.fn().mockReturnValue({ toArray: mockToArray });
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
const mockCollection = vi.fn().mockReturnValue({
  find: mockFind,
  updateOne: mockUpdateOne,
});

vi.mock('./_shared/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({
    db: {
      collection: (...args: any[]) => mockCollection(...args),
    },
  }),
}));

const mockRecalculate = vi.fn();
vi.mock('./_shared/services/scores.service', () => ({
  recalculateScoresForTournament: (...args: any[]) => mockRecalculate(...args),
}));

vi.mock('./_shared/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('scheduled-recalculate handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs successfully when tournaments need recalculation', async () => {
    const tournaments = [
      { _id: { toString: () => 'tid-1' }, name: 'Spring Open', needsRecalculation: true },
      { _id: { toString: () => 'tid-2' }, name: 'Summer Cup', needsRecalculation: true },
    ];
    mockToArray.mockResolvedValue(tournaments);
    mockRecalculate.mockResolvedValueOnce(5).mockResolvedValueOnce(3);

    const res = await handler({} as any, {} as any, () => {});

    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body!);
    expect(body.success).toBe(true);
    expect(body.data.tournamentsProcessed).toBe(2);
    expect(body.data.scoresUpdated).toBe(8);
    expect(mockRecalculate).toHaveBeenCalledTimes(2);
    expect(mockRecalculate).toHaveBeenCalledWith('tid-1');
    expect(mockRecalculate).toHaveBeenCalledWith('tid-2');
    expect(mockUpdateOne).toHaveBeenCalledTimes(2);
  });

  it('returns early when no tournaments flagged', async () => {
    mockToArray.mockResolvedValue([]);

    const res = await handler({} as any, {} as any, () => {});

    expect(res!.statusCode).toBe(200);
    const body = JSON.parse(res!.body!);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Nothing to recalculate');
    expect(mockRecalculate).not.toHaveBeenCalled();
  });

  it('handles errors gracefully', async () => {
    mockToArray.mockRejectedValue(new Error('DB connection failed'));

    const res = await handler({} as any, {} as any, () => {});

    expect(res!.statusCode).toBe(500);
    const body = JSON.parse(res!.body!);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Recalculation failed');
  });
});
