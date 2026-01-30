// Generic async data fetching hook with proper cancellation handling
// This hook handles all the common patterns for fetching data:
// - Loading states
// - Error handling
// - Cancelled request handling (React Strict Mode, unmounts, navigation)
// - Auth readiness waiting

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApiClient } from './useApiClient';

interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseAsyncDataOptions {
  /** Whether to fetch immediately on mount (default: true) */
  immediate?: boolean;
  /** Dependencies that should trigger a refetch */
  deps?: unknown[];
}

interface UseAsyncDataReturn<T> extends AsyncDataState<T> {
  /** Manually trigger a refetch */
  refetch: () => Promise<void>;
  /** Clear error state */
  clearError: () => void;
  /** Reset to initial state */
  reset: () => void;
}

/**
 * Hook for fetching data with proper async handling
 * Automatically handles:
 * - Waiting for auth to be ready
 * - Ignoring cancelled requests (unmount, navigation)
 * - Loading and error states
 * 
 * @param endpoint The API endpoint to fetch from
 * @param options Configuration options
 */
export function useAsyncData<T>(
  endpoint: string,
  options: UseAsyncDataOptions = {}
): UseAsyncDataReturn<T> {
  const { immediate = true, deps = [] } = options;
  const { get, isAuthReady } = useApiClient();
  
  const [state, setState] = useState<AsyncDataState<T>>({
    data: null,
    loading: immediate, // Start loading if immediate fetch
    error: null,
  });

  // Track if this is the first render to avoid double-fetch with deps
  const isFirstRender = useRef(true);

  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const response = await get<T>(endpoint);

    // Ignore cancelled requests - don't update state
    if (response.cancelled) {
      return;
    }

    if (response.success && response.data) {
      setState({ data: response.data, loading: false, error: null });
    } else {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: response.error || 'Failed to load data' 
      }));
    }
  }, [get, endpoint]);

  // Fetch on mount (when auth is ready) and when deps change
  useEffect(() => {
    if (!isAuthReady) return;
    if (!immediate && isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    isFirstRender.current = false;
    
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, fetchData, ...deps]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    ...state,
    refetch: fetchData,
    clearError,
    reset,
  };
}

/**
 * Hook for fetching data with POST/PUT requests
 * Useful for search or filtered data fetching
 */
export function useAsyncMutation<TRequest, TResponse>() {
  const { post, put, del, isAuthReady } = useApiClient();
  
  const [state, setState] = useState<AsyncDataState<TResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (
    endpoint: string,
    method: 'post' | 'put' | 'delete',
    body?: TRequest
  ): Promise<{ success: boolean; data?: TResponse; error?: string }> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    let response;
    switch (method) {
      case 'post':
        response = await post<TResponse>(endpoint, body);
        break;
      case 'put':
        response = await put<TResponse>(endpoint, body);
        break;
      case 'delete':
        response = await del<TResponse>(endpoint);
        break;
    }

    // Ignore cancelled requests
    if (response.cancelled) {
      return { success: false };
    }

    if (response.success && response.data) {
      setState({ data: response.data, loading: false, error: null });
      return { success: true, data: response.data };
    } else {
      const error = response.error || 'Operation failed';
      setState(prev => ({ ...prev, loading: false, error }));
      return { success: false, error };
    }
  }, [post, put, del]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    execute,
    clearError,
    isAuthReady,
  };
}
