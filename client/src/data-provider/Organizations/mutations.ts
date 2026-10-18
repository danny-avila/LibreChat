import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type {
  TOrganization,
  TOrganizationMember,
  TLeaveOrganizationResponse,
  TCreateOrganizationRequest,
  TOrganizationSessionResponse,
  TCreateOrganizationInviteRequest,
  TCreateOrganizationInviteResponse,
} from 'librechat-data-provider';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';

type Options<TData, TVariables> = UseMutationOptions<TData, unknown, TVariables>;

/*
 * Mutations that start a session in another organization (create, switch, accept) hand the
 * caller the new session; the caller finishes with `enterOrganizationSession`, which reloads
 * the app, so nothing here touches the query cache of the organization being left.
 */

export const useCreateOrganizationMutation = (
  onboardingToken?: string,
  options?: Options<TOrganizationSessionResponse, TCreateOrganizationRequest>,
): UseMutationResult<TOrganizationSessionResponse, unknown, TCreateOrganizationRequest> =>
  useMutation([MutationKeys.createOrganization], {
    mutationFn: (payload: TCreateOrganizationRequest) =>
      dataService.createOrganization(payload, onboardingToken),
    ...options,
  });

export const useSwitchOrganizationMutation = (
  options?: Options<TOrganizationSessionResponse, string>,
): UseMutationResult<TOrganizationSessionResponse, unknown, string> =>
  useMutation([MutationKeys.switchOrganization], {
    mutationFn: (organizationId: string) => dataService.switchOrganization(organizationId),
    ...options,
  });

export const useAcceptOrganizationInviteMutation = (
  onboardingToken?: string,
  options?: Options<TOrganizationSessionResponse, string>,
): UseMutationResult<TOrganizationSessionResponse, unknown, string> =>
  useMutation([MutationKeys.acceptOrganizationInvite], {
    mutationFn: (token: string) => dataService.acceptOrganizationInvite(token, onboardingToken),
    ...options,
  });

export const useAcceptPendingOrganizationInviteMutation = (
  onboardingToken?: string,
  options?: Options<TOrganizationSessionResponse, string>,
): UseMutationResult<TOrganizationSessionResponse, unknown, string> =>
  useMutation([MutationKeys.acceptOrganizationInvite, 'pending'], {
    mutationFn: (inviteId: string) =>
      dataService.acceptPendingOrganizationInvite(inviteId, onboardingToken),
    ...options,
  });

export const useRenameOrganizationMutation = (
  options?: Options<{ organization: TOrganization }, string>,
): UseMutationResult<{ organization: TOrganization }, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.renameOrganization], {
    mutationFn: (name: string) => dataService.renameOrganization({ name }),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.currentOrganization]);
      queryClient.invalidateQueries([QueryKeys.organizations]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useLeaveOrganizationMutation = (
  options?: Options<TLeaveOrganizationResponse, void>,
): UseMutationResult<TLeaveOrganizationResponse, unknown, void> =>
  useMutation([MutationKeys.leaveOrganization], {
    mutationFn: () => dataService.leaveOrganization(),
    ...options,
  });

export const useUpdateOrganizationMemberMutation = (
  options?: Options<{ member: TOrganizationMember }, { memberId: string; role: string }>,
): UseMutationResult<
  { member: TOrganizationMember },
  unknown,
  { memberId: string; role: string }
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.updateOrganizationMember], {
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      dataService.updateOrganizationMember(memberId, { role }),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.organizationMembers]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useDeactivateOrganizationMemberMutation = (
  options?: Options<{ member: TOrganizationMember }, string>,
): UseMutationResult<{ member: TOrganizationMember }, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.deactivateOrganizationMember], {
    mutationFn: (memberId: string) => dataService.deactivateOrganizationMember(memberId),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.organizationMembers]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useCreateOrganizationInviteMutation = (
  options?: Options<TCreateOrganizationInviteResponse, TCreateOrganizationInviteRequest>,
): UseMutationResult<
  TCreateOrganizationInviteResponse,
  unknown,
  TCreateOrganizationInviteRequest
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.createOrganizationInvite], {
    mutationFn: (payload: TCreateOrganizationInviteRequest) =>
      dataService.createOrganizationInvite(payload),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.organizationInvites]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useRevokeOrganizationInviteMutation = (
  options?: Options<{ revoked: true }, string>,
): UseMutationResult<{ revoked: true }, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.revokeOrganizationInvite], {
    mutationFn: (inviteId: string) => dataService.revokeOrganizationInvite(inviteId),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.organizationInvites]);
      options?.onSuccess?.(...args);
    },
  });
};

export const useResendOrganizationInviteMutation = (
  options?: Options<TCreateOrganizationInviteResponse, string>,
): UseMutationResult<TCreateOrganizationInviteResponse, unknown, string> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.resendOrganizationInvite], {
    mutationFn: (inviteId: string) => dataService.resendOrganizationInvite(inviteId),
    ...options,
    onSuccess: (...args) => {
      queryClient.invalidateQueries([QueryKeys.organizationInvites]);
      options?.onSuccess?.(...args);
    },
  });
};
