import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Time, dataService } from 'librechat-data-provider';
import { logger } from '~/utils';

export const useHealthCheck = () => {
  useQuery([QueryKeys.health], () => dataService.healthCheck(), {
    refetchInterval: Time.TEN_MINUTES,
    retry: false,
    onError: (error) => {
      console.error('Health check failed:', error);
    },
    cacheTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: (query) => {
      if (!query.state.dataUpdatedAt) {
        return true;
      }

      const lastUpdated = new Date(query.state.dataUpdatedAt);
      const tenMinutesAgo = new Date(Date.now() - Time.TEN_MINUTES);

      logger.log(`Last health check: ${lastUpdated.toISOString()}`);
      logger.log(`Ten minutes ago: ${tenMinutesAgo.toISOString()}`);

      return lastUpdated < tenMinutesAgo;
    },
  });
};

export const useInteractionHealthCheck = () => {
  const queryClient = useQueryClient();
  const lastInteractionTimeRef = useRef(Date.now());

  const checkHealthOnInteraction = useCallback(() => {
    const currentTime = Date.now();
    if (currentTime - lastInteractionTimeRef.current > Time.FIVE_MINUTES) {
      logger.log(
        'Checking health on interaction. Time elapsed:',
        currentTime - lastInteractionTimeRef.current,
      );
      queryClient.invalidateQueries([QueryKeys.health]);
      lastInteractionTimeRef.current = currentTime;
    }
  }, [queryClient]);

  return checkHealthOnInteraction;
};
