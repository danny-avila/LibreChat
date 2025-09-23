import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import {
  openRouterCreditsState,
  openRouterCreditsLoadingState,
  openRouterCreditsErrorState,
  type OpenRouterCredits,
} from '~/store/openrouter';
import { useAuthContext } from '~/hooks/AuthContext';
import { logger } from '~/utils';

interface UseOpenRouterCreditsReturn {
  fetchCredits: () => Promise<void>;
  isManualRefreshing: boolean;
  manualRefresh: () => Promise<void>;
  debouncedFetchCredits: () => void;
  optimisticUpdate: (costEstimate: number) => void;
}

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 1000; // 1 second
// Minimum interval between API calls
const MIN_FETCH_INTERVAL = 2000; // 2 seconds

export const useOpenRouterCredits = (): UseOpenRouterCreditsReturn => {
  const { token } = useAuthContext();
  const queryClient = useQueryClient();
  const currentCredits = useRecoilValue(openRouterCreditsState);
  const setCredits = useSetRecoilState(openRouterCreditsState);
  const setIsLoading = useSetRecoilState(openRouterCreditsLoadingState);
  const setError = useSetRecoilState(openRouterCreditsErrorState);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Track last fetch time to prevent excessive API calls
  const lastFetchTime = useRef(0);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingFetch = useRef(false);

  const fetchCredits = useCallback(
    async (skipRateLimit = false) => {
      if (!token) {
        setError('No authentication token');
        return;
      }

      // Rate limit protection (unless manually refreshing)
      const now = Date.now();
      if (!skipRateLimit && now - lastFetchTime.current < MIN_FETCH_INTERVAL) {
        logger.debug('Skipping credits fetch due to rate limit');
        pendingFetch.current = true;
        return;
      }

      lastFetchTime.current = now;
      pendingFetch.current = false;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/endpoints/openrouter/credits', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized: Invalid API key');
          }
          if (response.status === 429) {
            throw new Error('Rate limited: Too many requests');
          }
          throw new Error(`Failed to fetch credits: ${response.status}`);
        }

        const data = await response.json();

        // Transform the response to match our interface
        const credits: OpenRouterCredits = {
          balance: data.balance ?? data.credits ?? 0,
          currency: data.currency ?? 'USD',
          lastUpdated: Date.now(),
          optimistic: false, // Clear optimistic flag on real update
        };

        setCredits(credits);
        setError(null);

        // Invalidate React Query cache for consistency
        queryClient.invalidateQueries({ queryKey: ['openrouter', 'credits'] });
      } catch (err) {
        logger.error('Error fetching OpenRouter credits:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch credits');
        // Don't clear credits on error - keep stale data
      } finally {
        setIsLoading(false);
      }
    },
    [token, setCredits, setIsLoading, setError, queryClient],
  );

  // Debounced fetch for automatic updates after messages
  const debouncedFetchCredits = useCallback(() => {
    // Clear any existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new debounce timer
    debounceTimer.current = setTimeout(() => {
      fetchCredits(false);
    }, DEBOUNCE_DELAY);
  }, [fetchCredits]);

  // Optimistic update for immediate UI feedback
  const optimisticUpdate = useCallback(
    (costEstimate: number) => {
      if (!currentCredits) return;

      // Apply optimistic update immediately
      const optimisticCredits: OpenRouterCredits = {
        ...currentCredits,
        balance: Math.max(0, currentCredits.balance - costEstimate),
        optimistic: true, // Flag as optimistic
      };

      setCredits(optimisticCredits);

      // Schedule debounced fetch for real update
      debouncedFetchCredits();
    },
    [currentCredits, setCredits, debouncedFetchCredits],
  );

  const manualRefresh = useCallback(async () => {
    if (isManualRefreshing) return;

    setIsManualRefreshing(true);
    try {
      // Skip rate limit for manual refresh
      await fetchCredits(true);
    } finally {
      // Add a small delay to show the animation
      setTimeout(() => {
        setIsManualRefreshing(false);
      }, 500);
    }
  }, [fetchCredits, isManualRefreshing]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Handle pending fetches after rate limit expires
  useEffect(() => {
    if (pendingFetch.current) {
      const timeSinceLastFetch = Date.now() - lastFetchTime.current;
      const timeToWait = Math.max(0, MIN_FETCH_INTERVAL - timeSinceLastFetch);

      const timer = setTimeout(() => {
        if (pendingFetch.current) {
          fetchCredits(false);
        }
      }, timeToWait);

      return () => clearTimeout(timer);
    }
  }, [fetchCredits]);

  return {
    fetchCredits,
    isManualRefreshing,
    manualRefresh,
    debouncedFetchCredits,
    optimisticUpdate,
  };
};

export default useOpenRouterCredits;
