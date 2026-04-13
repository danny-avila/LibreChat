import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { TCreateMagicLink, TCreateMagicLinkResponse } from 'librechat-data-provider';

export const useCreateMagicLinkMutation = (options?: {
  onSuccess?: (data: TCreateMagicLinkResponse) => void;
  onError?: (error: unknown) => void;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.createMagicLink],
    mutationFn: (data: TCreateMagicLink) => dataService.createMagicLink(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.magicLinks] });
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
};

export const useRevokeMagicLinkMutation = (options?: {
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [MutationKeys.revokeMagicLink],
    mutationFn: (id: string) => dataService.revokeMagicLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.magicLinks] });
      options?.onSuccess?.();
    },
    onError: options?.onError,
  });
};
