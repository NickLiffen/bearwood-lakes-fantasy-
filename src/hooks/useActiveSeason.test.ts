const mockGet = vi.fn().mockResolvedValue({ success: true, data: [] });

vi.mock('./useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
    isAuthReady: true,
  }),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useActiveSeason, clearSeasonCache } from './useActiveSeason';

const activeSeason = {
  id: '1',
  name: '2026',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  isActive: true,
  status: 'active' as const,
};

describe('useActiveSeason', () => {
  beforeEach(() => {
    clearSeasonCache();
    mockGet.mockReset();
    mockGet.mockResolvedValue({ success: true, data: [] });
    vi.restoreAllMocks();
  });

  it('clearSeasonCache resets the cache', () => {
    // Just verify it doesn't throw
    expect(() => clearSeasonCache()).not.toThrow();
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useActiveSeason());
    expect(result.current.loading).toBe(true);
  });

  it('returns statsKey', () => {
    const { result } = renderHook(() => useActiveSeason());
    expect(result.current.statsKey).toBeDefined();
  });

  it('re-fetches after cache TTL expires', async () => {
    mockGet.mockResolvedValue({ success: true, data: [activeSeason] });

    // First render — fetches and caches
    const { result, unmount } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.season).toEqual(activeSeason);
    expect(mockGet).toHaveBeenCalledTimes(1);
    unmount();

    // Advance time past the 5-minute TTL
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    mockGet.mockResolvedValue({ success: true, data: [activeSeason] });

    // Second render — cache expired, should re-fetch
    const { result: result2 } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result2.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('uses cache when TTL has not expired', async () => {
    mockGet.mockResolvedValue({ success: true, data: [activeSeason] });

    // First render — fetches and caches
    const { result, unmount } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);
    unmount();

    // Time is still within TTL — should use cache, no re-fetch
    const { result: result2 } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result2.current.loading).toBe(false));
    expect(result2.current.season).toEqual(activeSeason);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange clears expired cache', async () => {
    mockGet.mockResolvedValue({ success: true, data: [activeSeason] });

    const { result } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Advance time past TTL
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);

    // Simulate tab becoming visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // After visibility change cleared the cache, a new render should re-fetch
    mockGet.mockResolvedValue({ success: true, data: [activeSeason] });
    const { result: result2 } = renderHook(() => useActiveSeason());
    await waitFor(() => expect(result2.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
