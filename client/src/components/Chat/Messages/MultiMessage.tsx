import { memo, useEffect, useRef, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactElement } from 'react';
import type { TMessageProps } from '~/common';
import MessageContent from '~/components/Messages/MessageContent';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';

function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));

  const setSiblingIdxRev = useCallback(
    (value: number) => {
      setSiblingIdx((messagesTree?.length ?? 0) - value - 1);
    },
    [messagesTree?.length, setSiblingIdx],
  );

  const siblingIdxRef = useRef(siblingIdx);
  siblingIdxRef.current = siblingIdx;
  /** Identity of this level's last committed display (`viewedId`) and its
   *  newest child (`newestId`), for the reconciliation below. */
  const displayedRef = useRef<{ newestId?: string; viewedId?: string }>({});
  const treeRef = useRef<typeof messagesTree | null>(null);

  /**
   * Sibling selection is positional (reversed index), so a change to the
   * children array would silently change WHAT this level displays. Reconcile
   * by identity instead of blanket-resetting:
   *
   * - An APPENDED newest child means a submission landed here (send,
   *   regenerate, edit-resubmit all append) — follow it, the long-standing
   *   behavior. An append is a newest-id change where the prior newest still
   *   exists; when it vanished instead, the same row was RE-KEYED (streaming
   *   ids hydrate to durable ids at finalize — the legacy regenerate path
   *   mints a new UUID for `_`-suffixed ids), and following it would yank a
   *   user who paged away mid-stream.
   * - Otherwise the change is background churn (an abandoned preempt sibling
   *   restored at finalize, a refetch merge dropping an optimistic row, id
   *   hydration) — keep the message the user was viewing, recomputing its
   *   reversed index from its new position. Only when it no longer exists
   *   does the selection fall back to the newest.
   *
   * Keyed on tree identity via `treeRef` (streaming mints a fresh array per
   * write); a plain `siblingIdx` change (the user paging the switcher) only
   * records the newly viewed identity.
   */
  useEffect(() => {
    const length = messagesTree?.length ?? 0;
    const treeChanged = treeRef.current !== messagesTree;
    treeRef.current = messagesTree;
    if (!messagesTree || length === 0) {
      displayedRef.current = {};
      return;
    }
    const newestId = messagesTree[length - 1]?.messageId;
    const currentIdx = siblingIdxRef.current;

    if (!treeChanged) {
      displayedRef.current = {
        newestId,
        viewedId: messagesTree[length - currentIdx - 1]?.messageId,
      };
      return;
    }

    const previous = displayedRef.current;
    const appendedNewest =
      previous.newestId == null ||
      (previous.newestId !== newestId &&
        messagesTree.some((message) => message?.messageId === previous.newestId));
    let nextSiblingIdx = currentIdx;
    if (appendedNewest) {
      nextSiblingIdx = 0;
    } else if (currentIdx > 0 && previous.viewedId != null) {
      const viewedIndex = messagesTree.findIndex(
        (message) => message?.messageId === previous.viewedId,
      );
      nextSiblingIdx = viewedIndex >= 0 ? length - viewedIndex - 1 : 0;
    } else if (currentIdx >= length) {
      nextSiblingIdx = 0;
    }

    if (nextSiblingIdx !== currentIdx) {
      setSiblingIdx(nextSiblingIdx);
    }
    displayedRef.current = {
      newestId,
      viewedId: messagesTree[length - nextSiblingIdx - 1]?.messageId,
    };
  }, [messagesTree, siblingIdx, setSiblingIdx]);

  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  const currentSiblingIdx = messagesTree.length - siblingIdx - 1;
  const message = messagesTree[currentSiblingIdx] as TMessage | undefined;

  if (!message) {
    return null;
  }

  /**
   * No explicit key — React uses positional reconciliation since MultiMessage
   * always renders exactly one row at this position.
   *
   * Both messageId and parentMessageId change during the SSE lifecycle
   * (client UUID → createdHandler ID → server ID), so neither can serve as a
   * stable key. Using either caused React to unmount/remount the entire subtree
   * on each SSE event, destroying memoized state and causing visible flickering.
   *
   * Without a key, React reuses the component instance and updates props in place.
   * The row wrappers and MessageRender/ContentRender are memoized with field-level
   * comparators, and sibling switches work correctly because the message prop
   * changes entirely.
   */
  const sharedProps = {
    message,
    currentEditId,
    setCurrentEditId,
    siblingIdx: currentSiblingIdx,
    siblingCount: messagesTree.length,
    setSiblingIdx: setSiblingIdxRev,
  };

  let row: ReactElement;
  if (isAssistantsEndpoint(message.endpoint) && message.content) {
    row = <MessageParts {...sharedProps} />;
  } else if (message.content) {
    row = <MessageContent {...sharedProps} />;
  } else {
    row = <Message {...sharedProps} />;
  }

  /**
   * The child recursion is a sibling of the row (not rendered inside it), so a
   * row that bails via its memo comparator never severs the walk that delivers
   * streaming updates to descendants: `buildTree` mints fresh `children` arrays
   * on every streaming write, which re-renders exactly this spine while settled
   * rows skip their subtrees.
   */
  return (
    <>
      {row}
      <MemoizedMultiMessage
        messageId={message.messageId}
        messagesTree={message.children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}

const MemoizedMultiMessage = memo(MultiMessage);

export default MemoizedMultiMessage;
