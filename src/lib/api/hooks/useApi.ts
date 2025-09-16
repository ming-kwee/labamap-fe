/**
 * API Hooks
 * React hooks for API state management with error handling and loading states
 */

import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '../types';

// Base API state interface
export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  success: boolean;
}

// Hook options
export interface UseApiOptions {
  immediate?: boolean;
  onSuccess?: (data: unknown) => void;
  onError?: (error: string) => void;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Generic API hook for handling async operations
 */
export function useApi<T>(
  apiFunction: (...args: unknown[]) => Promise<ApiResponse<T>>,
  options: UseApiOptions = {}
) {
  const {
    immediate = false,
    onSuccess,
    onError,
    retryAttempts = 0,
    retryDelay = 1000,
  } = options;

  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
    success: false,
  });

  const [retryCount, setRetryCount] = useState(0);


  const execute = useCallback(
    async (...args: unknown[]): Promise<ApiResponse<T>> => {
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        success: false,
      }));

      try {
        const response = await apiFunction(...args);

        if (response.success && response.data !== undefined) {
          setState({
            data: response.data,
            loading: false,
            error: null,
            success: true,
          });
          
          onSuccess?.(response.data);
          setRetryCount(0);
        } else {
          const errorMessage = response.error?.message || 'Unknown error occurred';
          setState(prev => ({
            ...prev,
            loading: false,
            error: errorMessage,
            success: false,
          }));
          
          onError?.(errorMessage);
          
          // Retry logic
          if (retryCount < retryAttempts) {
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              // Don't call execute recursively here to avoid infinite loops
            }, retryDelay);
          }
        }
        
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Network error';
        const errorResponse: ApiResponse<T> = {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: errorMessage,
          },
        };
        
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          success: false,
        }));
        
        onError?.(errorMessage);
        return errorResponse;
      }
    },
    [apiFunction, onSuccess, onError, retryCount, retryAttempts, retryDelay]
  );


  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      success: false,
    });
    setRetryCount(0);
  }, []);

  const retry = useCallback(() => {
    setRetryCount(0);
    // Note: This requires the last arguments to be stored if we want to retry with same params
    // For now, just reset and let user call execute again
    reset();
  }, [reset]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate]);

  return {
    ...state,
    execute,
    reset,
    retry,
    isIdle: !state.loading && !state.error && !state.success,
  };
}

/**
 * Hook for mutations (POST, PUT, DELETE operations)
 */
export function useMutation<T, TArgs extends unknown[] = unknown[]>(
  apiFunction: (...args: TArgs) => Promise<ApiResponse<T>>,
  options: UseApiOptions = {}
) {
  const { execute, ...state } = useApi(
    apiFunction as (...args: unknown[]) => Promise<ApiResponse<T>>, 
    { ...options, immediate: false }
  );

  const mutate = useCallback(
    async (...args: TArgs) => {
      return execute(...args);
    },
    [execute]
  );

  return {
    ...state,
    mutate,
    reset: state.reset,
  };
}

/**
 * Hook for queries (GET operations) with automatic execution
 */
export function useQuery<T>(
  apiFunction: (...args: unknown[]) => Promise<ApiResponse<T>>,
  args: unknown[],
  options: UseApiOptions = {}
) {
  const { execute, ...state } = useApi(apiFunction, { ...options, immediate: true });

  const refetch = useCallback(() => {
    return execute(...args);
  }, [execute, args]);

  useEffect(() => {
    execute(...args);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ...state,
    refetch,
  };
}

/**
 * Hook for infinite loading/pagination
 */
export function useInfiniteQuery<T>(
  apiFunction: (page: number, ...args: unknown[]) => Promise<ApiResponse<{ data: T[]; hasMore: boolean }>>,
  args: unknown[] = [],
  options: UseApiOptions = {}
) {
  const [allData, setAllData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const { execute, loading, error } = useApi(
    (...allArgs: unknown[]) => {
      const [pageArg, ...restArgs] = allArgs;
      return apiFunction(pageArg as number, ...restArgs);
    }, 
    { ...options, immediate: false }
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    await execute(page, ...args);
  }, [execute, loading, hasMore, page, args]);

  const reset = useCallback(() => {
    setAllData([]);
    setPage(1);
    setHasMore(true);
  }, []);

  useEffect(() => {
    loadMore();
  }, []); // Only run once on mount

  return {
    data: allData,
    loading,
    error,
    hasMore,
    loadMore,
    reset,
  };
}