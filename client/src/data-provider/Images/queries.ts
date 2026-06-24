import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { TImageResult, TImageModelsConfig, TImageGalleryPage } from 'librechat-data-provider';

export const useImageModels = () =>
  useQuery<TImageModelsConfig>([QueryKeys.imageModels], () => dataService.getImageModels(), {
    staleTime: Infinity,
  });

export const useImageGallery = () =>
  useInfiniteQuery<TImageGalleryPage>({
    queryKey: [QueryKeys.imageGallery],
    queryFn: ({ pageParam }) => dataService.getImageGallery(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });

/** Maximum number of polls before treating a generation as timed out (~3 min at 3s). */
export const POLL_TIMEOUT_COUNT = 60;

const resultInterval = (data?: TImageResult, failureCount?: number): number | false => {
  if (failureCount != null && failureCount > 0) {
    return false;
  }
  if (!data) {
    return 3000;
  }
  return data.status === 'completed' || data.status === 'failed' ? false : 3000;
};

export const useImageResult = (predictionId: string | null, enabled: boolean, pollCount?: number) =>
  useQuery<TImageResult>(
    [QueryKeys.imageResult, predictionId],
    () => dataService.getImageResult(predictionId ?? ''),
    {
      enabled: !!predictionId && enabled && (pollCount == null || pollCount < POLL_TIMEOUT_COUNT),
      refetchInterval: (_data, query) =>
        resultInterval(_data, query.state.fetchFailureCount ?? query.state.errorUpdateCount),
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
