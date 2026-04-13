import { handler } from './scheduled-apply-transfers';
import { mockContext } from './__test-utils__';

vi.mock('./_shared/utils/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getRequestId: vi.fn().mockReturnValue('req-123'),
}));

const mockApplyAll = vi.fn();
vi.mock('./_shared/services/picks.service', () => ({
  applyAllPendingChanges: (...args: unknown[]) => mockApplyAll(...args),
}));

describe('scheduled-apply-transfers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies pending transfers and returns count', async () => {
    mockApplyAll.mockResolvedValue({
      applied: 3,
      total: 3,
      details: [
        { userId: 'u1', pendingChangedAt: new Date() },
        { userId: 'u2', pendingChangedAt: new Date() },
        { userId: 'u3', pendingChangedAt: new Date() },
      ],
    });

    const event = { httpMethod: 'POST', body: null, headers: {} } as never;
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.success).toBe(true);
    expect(body.data.applied).toBe(3);
  });

  it('handles zero pending transfers gracefully', async () => {
    mockApplyAll.mockResolvedValue({ applied: 0, total: 0, details: [] });

    const event = { httpMethod: 'POST', body: null, headers: {} } as never;
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.data.applied).toBe(0);
  });

  it('returns 500 on failure', async () => {
    mockApplyAll.mockRejectedValue(new Error('DB down'));

    const event = { httpMethod: 'POST', body: null, headers: {} } as never;
    const res = await handler(event, mockContext);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body!);
    expect(body.success).toBe(false);
  });
});
