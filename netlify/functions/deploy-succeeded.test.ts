import { handler } from './deploy-succeeded';

const mockCreateIndex = vi.fn().mockResolvedValue(undefined);
const mockFindOne = vi.fn();
const mockInsertOne = vi.fn().mockResolvedValue({ insertedId: 'id1' });
const mockUpdateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const mockCollection = vi.fn().mockReturnValue({
  createIndex: mockCreateIndex,
  findOne: mockFindOne,
  insertOne: mockInsertOne,
  updateOne: mockUpdateOne,
});
const mockDb = vi.fn().mockReturnValue({ collection: mockCollection });
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue({ db: mockDb, close: mockClose });

vi.mock('mongodb', () => ({
  MongoClient: { connect: (...args: any[]) => mockConnect(...args) },
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed-password') },
}));

describe('deploy-succeeded handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, MONGODB_URI: 'mongodb://localhost:27017' };
    mockFindOne.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('skips non-deploy-preview contexts', async () => {
    const res = await handler({
      body: JSON.stringify({ payload: { context: 'production' } }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('skipping');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('seeds PR database for deploy previews', async () => {
    const res = await handler({
      body: JSON.stringify({
        payload: { context: 'deploy-preview', review_id: 42 },
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('bearwood-fantasy-pr-42');
    expect(mockConnect).toHaveBeenCalledWith('mongodb://localhost:27017');
    expect(mockDb).toHaveBeenCalledWith('bearwood-fantasy-pr-42');
    expect(mockCreateIndex).toHaveBeenCalled();
    expect(mockInsertOne).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('returns 500 when MONGODB_URI is missing', async () => {
    delete process.env.MONGODB_URI;

    const res = await handler({
      body: JSON.stringify({
        payload: { context: 'deploy-preview', review_id: 99 },
      }),
    });

    expect(res.statusCode).toBe(500);
    expect(res.body).toContain('Missing MONGODB_URI');
  });

  it('skips admin insert when admin already exists (idempotent)', async () => {
    mockFindOne.mockImplementation((_query: any) => {
      return Promise.resolve({ username: 'admin' });
    });

    const res = await handler({
      body: JSON.stringify({
        payload: { context: 'deploy-preview', review_id: 7 },
      }),
    });

    expect(res.statusCode).toBe(200);
    // insertOne should only be called for season (not admin), since admin exists
    // The handler calls insertOne for admin user and season; with admin existing, only season insert
    expect(mockInsertOne).toHaveBeenCalledTimes(0);
  });
});
