import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, MutationKeys, QueryKeys } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  TContact,
  TContactRequest,
  TUpdateContactRequest,
} from 'librechat-data-provider';

export const useCreateContactMutation = (): UseMutationResult<TContact, unknown, TContactRequest> => {
  const queryClient = useQueryClient();
  return useMutation((payload: TContactRequest) => dataService.createContact(payload), {
    mutationKey: [MutationKeys.createContact],
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.contacts]);
    },
  });
};

export const useUpdateContactMutation = (): UseMutationResult<
  TContact,
  unknown,
  { contactId: string; data: TUpdateContactRequest }
> => {
  const queryClient = useQueryClient();
  return useMutation(
    (variables: { contactId: string; data: TUpdateContactRequest }) =>
      dataService.updateContact(variables),
    {
      mutationKey: [MutationKeys.updateContact],
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.contacts]);
      },
    },
  );
};

export const useDeleteContactMutation = (): UseMutationResult<TContact, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation((contactId: string) => dataService.deleteContact(contactId), {
    mutationKey: [MutationKeys.deleteContact],
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.contacts]);
    },
  });
};