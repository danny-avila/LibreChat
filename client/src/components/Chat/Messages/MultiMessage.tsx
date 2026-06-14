import { useRef, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import { resolveSiblingSelection } from '~/utils';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';

export default function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  /**
   * Per-fork branch memory. `seen` records every sibling id ever rendered at
   * this fork so a genuinely new sibling (a submission/regeneration/edit here)
   * can be told apart from one that was transiently dropped and restored:
   * `getRegenerateSubmissionMessages` slices the flat message array while a
   * regeneration elsewhere streams, so an unrelated fork's children briefly
   * shrink then grow back. `selectedId` is the branch the user is committed to.
   * Reset when the fork identity (parent messageId) changes, since this
   * instance is reused positionally across conversations.
   */
  const seenRef = useRef<Set<string>>(new Set());
  const selectedIdRef = useRef<string | null>(null);
  const forkRef = useRef<string | null | undefined>(messageId);
  if (forkRef.current !== messageId) {
    forkRef.current = messageId;
    seenRef.current = new Set();
    selectedIdRef.current = null;
  }

  const treeRef = useRef(messagesTree);
  treeRef.current = messagesTree;

  const setSiblingIdxRev = useCallback(
    (value: number) => {
      const tree = treeRef.current;
      selectedIdRef.current = tree?.[value]?.messageId ?? null;
      setSiblingIdx((tree?.length ?? 0) - value - 1);
    },
    [setSiblingIdx],
  );

  /**
   * Re-point the active sibling whenever the sibling set changes (ids/order),
   * not on per-chunk content updates -- the JSON id signature is the structural
   * signal. Preserves the user's branch across tree churn and only snaps to a
   * newly created sibling, replacing reset-to-newest-on-any-length-change.
   */
  const idsKey = JSON.stringify((messagesTree ?? []).map((message) => message.messageId));
  useEffect(() => {
    const ids = JSON.parse(idsKey) as string[];
    if (ids.length === 0) {
      return;
    }
    const { index, selectedId } = resolveSiblingSelection(
      ids,
      seenRef.current,
      selectedIdRef.current,
    );
    ids.forEach((id) => seenRef.current.add(id));
    selectedIdRef.current = selectedId;
    if (index >= 0) {
      setSiblingIdx(ids.length - 1 - index);
    }
  }, [idsKey, setSiblingIdx]);

  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  const currentSiblingIdx = messagesTree.length - siblingIdx - 1;
  const message = messagesTree[currentSiblingIdx] as TMessage | undefined;

  if (!message) {
    return null;
  }

  /**
   * No explicit key -- React uses positional reconciliation since MultiMessage
   * always renders exactly one child at this position.
   *
   * Both messageId and parentMessageId change during the SSE lifecycle
   * (client UUID -> createdHandler ID -> server ID), so neither can serve as a
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
    siblingCount: messagesTree.length,
    setSiblingIdx: setSiblingIdxRev,
  };

  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    return <MessageParts {...sharedProps} />;
  } else if (message.content) {
    return <MessageContent {...sharedProps} />;
  }

  return <Message {...sharedProps} />;
}
