import { useMutation } from '@tanstack/react-query';
import { dataService, MutationKeys } from 'librechat-data-provider';
import type { VoiceSessionRequest, VoiceSessionResponse } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * Mints a LiveKit room token. Deliberately a mutation rather than a query: the token is a
 * short-lived credential, so it must not be cached, retried, or placed in a URL.
 */
export const useStartVoiceSession = (): UseMutationResult<
  VoiceSessionResponse,
  Error,
  VoiceSessionRequest
> =>
  useMutation({
    mutationKey: [MutationKeys.startVoiceSession],
    mutationFn: (payload: VoiceSessionRequest) => dataService.startVoiceSession(payload),
  });
