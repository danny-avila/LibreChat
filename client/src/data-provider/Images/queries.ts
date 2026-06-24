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

const resultInterval = (data?: TImageResult): number | false =>
  data && (data.status === 'completed' || data.status === 'failed') ? false : 3000;

export const useImageResult = (predictionId: string | null, enabled: boolean) =>
  useQuery<TImageResult>(
    [QueryKeys.imageResult, predictionId],
    () => dataService.getImageResult(predictionId ?? ''),
    {
      enabled: !!predictionId && enabled,
      refetchInterval: resultInterval,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );
