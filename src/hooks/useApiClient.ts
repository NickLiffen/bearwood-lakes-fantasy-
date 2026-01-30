// API client hook for authenticated requests

import { useCallback, useRef, useEffect } from 'react';
import { useAuth } from './useAuth';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** True if the request was cancelled (e.g., component unmounted). Responses with cancelled=true should be ignored. */
  cancelled?: boolean;
}

interface RequestOptions extends Omit<RequestInit, 'signal'> {
  timeout?: number;
  skipAuth?: boolean;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds (increased for slower connections)

// Custom abort reasons to distinguish timeout from cleanup
const ABORT_REASON_TIMEOUT = 'timeout';
const ABORT_REASON_CLEANUP = 'cleanup';

/**
 * Hook for making authenticated API requests to Netlify Functions
 * Features:
 * - Automatic auth header injection
 * - Request timeout (default 30s)
 * - Abort controller for cleanup on unmount
 * - Auto-refresh on 401
 * - Credentials support for httpOnly cookies
 */
export const useApiClient = () => {
  const { token, refreshToken, logout, loading: authLoading } = useAuth();
  // Track all active controllers for cleanup on unmount
  const activeControllersRef = useRef<Set<AbortController>>(new Set());

  // Cleanup all active requests on unmount
  useEffect(() => {
    const controllers = activeControllersRef.current;
    return () => {
      controllers.forEach(controller => controller.abort(ABORT_REASON_CLEANUP));
      controllers.clear();
    };
  }, []);

  const request = useCallback(async <T>(
    endpoint: string,
    options: RequestOptions = {},
    isRetry = false
  ): Promise<ApiResponse<T>> => {
    const { timeout = DEFAULT_TIMEOUT, skipAuth = false, ...fetchOptions } = options;

    // Create a new abort controller for this specific request
    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    // Check if already aborted (can happen with Strict Mode rapid mount/unmount)
    if (controller.signal.aborted) {
      activeControllersRef.current.delete(controller);
      return { success: false, cancelled: true };
    }

    // Set up timeout - abort with specific reason
    const timeoutId = setTimeout(() => controller.abort(ABORT_REASON_TIMEOUT), timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((fetchOptions.headers as Record<string, string>) || {}),
      };

      // Add auth header if token exists and auth not skipped
      if (token && !skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/.netlify/functions/${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
        credentials: 'include', // Include cookies for refresh token
      });

      clearTimeout(timeoutId);

      // Handle 401 - try to refresh token
      if (response.status === 401 && !isRetry && !skipAuth) {
        activeControllersRef.current.delete(controller);
        const refreshSuccess = await refreshToken();
        if (refreshSuccess) {
          // Retry the request with new token
          return request<T>(endpoint, options, true);
        } else {
          // Refresh failed, logout user
          logout();
          return {
            success: false,
            error: 'Session expired. Please log in again.',
          };
        }
      }

      const data = await response.json();
      
      // Remove controller from active set on success
      activeControllersRef.current.delete(controller);
      
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      // Remove controller from active set on error
      activeControllersRef.current.delete(controller);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          // Check the abort reason to distinguish timeout from cleanup
          const reason = controller.signal.reason;
          
          if (reason === ABORT_REASON_CLEANUP) {
            // Component unmounted or navigation - return cancelled response
            // Components should check for cancelled and ignore these responses
            return {
              success: false,
              cancelled: true,
            };
          }
          
          // Genuine timeout
          return {
            success: false,
            error: 'Request timed out. Please try again.',
          };
        }
        return {
          success: false,
          error: error.message,
        };
      }

      // Non-Error exception - check if controller was aborted
      if (controller.signal.aborted) {
        return {
          success: false,
          cancelled: true,
        };
      }

      return {
        success: false,
        error: 'Request failed',
      };
    }
  }, [token, refreshToken, logout]);

  const get = useCallback(<T>(endpoint: string, options?: RequestOptions) => {
    return request<T>(endpoint, { ...options, method: 'GET' });
  }, [request]);

  const post = useCallback(<T>(endpoint: string, body: unknown, options?: RequestOptions) => {
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }, [request]);

  const put = useCallback(<T>(endpoint: string, body: unknown, options?: RequestOptions) => {
    return request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }, [request]);

  const del = useCallback(<T>(endpoint: string, options?: RequestOptions) => {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  }, [request]);

  // Whether auth is still loading (don't make requests until ready)
  const isAuthReady = !authLoading;

  const abortAll = useCallback(() => {
    activeControllersRef.current.forEach(controller => controller.abort());
    activeControllersRef.current.clear();
  }, []);

  return { get, post, put, del, request, abort: abortAll, isAuthReady };
};

export default useApiClient;
