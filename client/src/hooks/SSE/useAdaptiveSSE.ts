import { useRecoilValue } from 'recoil';
import type { TSubmission } from 'librechat-data-provider';
import type { EventHandlerParams } from './useEventHandlers';
import useSSE from './useSSE';
import useResumableSSE from './useResumableSSE';
import store from '~/store';

type ChatHelpers = Pick<
  EventHandlerParams,
  | 'setMessages'
  | 'getMessages'
  | 'setConversation'
  | 'setIsSubmitting'
  | 'newConversation'
  | 'resetLatestMessage'
>;

/**
 * Adaptive SSE hook that switches between standard and resumable modes.
 * Uses Recoil state to determine which mode to use.
 *
 * Note: Both hooks are always called to comply with React's Rules of Hooks.
 * We pass null submission to the inactive one.
 */
export default function useAdaptiveSSE(
  submission: TSubmission | null,
  chatHelpers: ChatHelpers,
  isAddedRequest = false,
  runIndex = 0,
) {
  const resumableEnabled = useRecoilValue(store.resumableStreams);

  useSSE(resumableEnabled ? null : submission, chatHelpers, isAddedRequest, runIndex);

  const { streamId } = useResumableSSE(
    resumableEnabled ? submission : null,
    chatHelpers,
    isAddedRequest,
    runIndex,
  );

  return { streamId, resumableEnabled };
}
