import { useMutation } from '@tanstack/react-query';
import { dataService, MutationKeys } from 'librechat-data-provider';
import type { TImageGenRequest, TImagePrediction } from 'librechat-data-provider';

type GenerateImageOptions = {
  onSuccess?: (data: TImagePrediction) => void;
  onError?: (error: unknown) => void;
};

export const useGenerateImage = (opts?: GenerateImageOptions) =>
  useMutation([MutationKeys.imageGenerate], {
    mutationFn: (body: TImageGenRequest) => dataService.generateImage(body),
    ...opts,
  });
