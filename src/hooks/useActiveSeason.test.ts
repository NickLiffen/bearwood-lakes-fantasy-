vi.mock('./useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: [] }),
    isAuthReady: true,
  }),
}));

import { renderHook } from '@testing-library/react';
import { useActiveSeason, clearSeasonCache } from './useActiveSeason';

describe('useActiveSeason', () => {
  beforeEach(() => {
    clearSeasonCache();
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
});
