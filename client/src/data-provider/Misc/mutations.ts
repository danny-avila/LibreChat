import { useMutation } from '@tanstack/react-query';
import { dataService, MutationKeys } from 'librechat-data-provider';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useCreateStripeCheckoutSessionMutation = (
  options?: UseMutationOptions<
    t.TCreateStripeCheckoutSessionResponse,
    unknown,
    t.TCreateStripeCheckoutSessionRequest,
    unknown
  >,
): UseMutationResult<
  t.TCreateStripeCheckoutSessionResponse,
  unknown,
  t.TCreateStripeCheckoutSessionRequest,
  unknown
> =>
  useMutation(
    [MutationKeys.createStripeCheckoutSession],
    (payload: t.TCreateStripeCheckoutSessionRequest) => dataService.createStripeCheckoutSession(payload),
    options,
  );