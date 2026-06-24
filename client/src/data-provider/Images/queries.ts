import { useQuery } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { TImageResult, TImageModelsConfig, TImageGalleryPage } from 'librechat-data-provider';

export const useImageModels = () =>
  useQuery<TImageModelsConfig>([QueryKeys.imageModels], () => dataService.getImageModels(), {
    staleTime: Infinity,
  });

export const useImageGallery = () =>
  useQuery<TImageGalleryPage>([QueryKeys.imageGallery], () => dataService.getImageGallery(), {
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
