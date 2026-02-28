vi.mock('./useAuth', () => ({
  useAuth: () => ({
    token: 'mock-token',
    refreshToken: vi.fn().mockResolvedValue(true),
    logout: vi.fn(),
    loading: false,
  }),
}));

import { renderHook } from '@testing-library/react';
import { useApiClient } from './useApiClient';

describe('useApiClient', () => {
  it('returns get, post, put, del functions', () => {
    const { result } = renderHook(() => useApiClient());

    expect(typeof result.current.get).toBe('function');
    expect(typeof result.current.post).toBe('function');
    expect(typeof result.current.put).toBe('function');
    expect(typeof result.current.del).toBe('function');
  });

  it('returns isAuthReady as true when not loading', () => {
    const { result } = renderHook(() => useApiClient());
    expect(result.current.isAuthReady).toBe(true);
  });

  it('returns abort function', () => {
    const { result } = renderHook(() => useApiClient());
    expect(typeof result.current.abort).toBe('function');
  });
});
