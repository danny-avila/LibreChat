import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { TMessage } from 'librechat-data-provider';

/** One-shot reasoning selection owned by the composer for its next full turn. */
export const pendingReasoningOverrideFamily = atomFamily((_conversationId: string) =>
  atom<TMessage['reasoningOverride']>(undefined),
);

/** Release a conversation member when its composer state is cleared. */
export const removePendingReasoningOverride = (conversationId: string) => {
  pendingReasoningOverrideFamily.remove(conversationId);
};
