import { useRecoilState } from 'recoil';
import { useEffect, useCallback, useMemo } from 'react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';
import { preferredSiblingIndex, filterSiblingMessages } from '~/utils/messageSiblings';
import store from '~/store';

export default function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  const treeSignature = useMemo(
    () =>
      (messagesTree ?? [])
        .map(
          (entry) =>
            `${entry.messageId ?? ''}:${entry.text?.length ?? 0}:${entry.children?.length ?? 0}:${entry.parentMessageId ?? ''}`,
        )
        .join(','),
    [messagesTree],
  );

  const visibleSiblings = useMemo(
    () => filterSiblingMessages(messagesTree ?? []),
    [messagesTree, treeSignature],
  );

  const setSiblingIdxRev = useCallback(
    (value: number) => {
      setSiblingIdx(visibleSiblings.length - value - 1);
    },
    [visibleSiblings.length, setSiblingIdx],
  );

  useEffect(() => {
    if (!visibleSiblings.length) {
      return;
    }
    setSiblingIdx(preferredSiblingIndex(visibleSiblings));
  }, [treeSignature, visibleSiblings, setSiblingIdx]);

  useEffect(() => {
    if (visibleSiblings.length && siblingIdx >= visibleSiblings.length) {
      setSiblingIdx(0);
    }
  }, [siblingIdx, visibleSiblings.length, setSiblingIdx]);

  if (!visibleSiblings.length) {
    return null;
  }

  const currentSiblingIdx = visibleSiblings.length - siblingIdx - 1;
  const message = visibleSiblings[currentSiblingIdx] as TMessage | undefined;

  if (!message) {
    return null;
  }

  /**
   * No explicit key — React uses positional reconciliation since MultiMessage
   * always renders exactly one child at this position.
   *
   * Both messageId and parentMessageId change during the SSE lifecycle
   * (client UUID → createdHandler ID → server ID), so neither can serve as a
   * stable key. Using either caused React to unmount/remount the entire subtree
   * on each SSE event, destroying memoized state and causing visible flickering.
   *
   * Without a key, React reuses the component instance and updates props in place.
   * The memo comparators on ContentRender/MessageRender handle field-level diffing,
   * and sibling switches work correctly because the message prop changes entirely.
   */
  const sharedProps = {
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx: currentSiblingIdx,
    siblingCount: visibleSiblings.length,
    setSiblingIdx: setSiblingIdxRev,
  };

  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    return <MessageParts {...sharedProps} />;
  } else if (message.content) {
    return <MessageContent {...sharedProps} />;
  }

  return <Message {...sharedProps} />;
}
