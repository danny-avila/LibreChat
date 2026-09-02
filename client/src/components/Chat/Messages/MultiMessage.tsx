import { memo, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilState } from 'recoil';
import { ContentTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode, ReactElement } from 'react';
import type { TMessageProps } from '~/common';
import EventSubagentActivityGroup from '~/components/Chat/Subagents/EventSubagentActivityGroup';
import { serializeMessageForClipboard } from '~/hooks/Messages/useCopyToClipboard';
import { activeSpeechMessageIdAtom } from '~/hooks/Messages/rowWindowState';
import MessageContent from '~/components/Messages/MessageContent';
import { useRowMountWindow } from '~/hooks/Messages';
import MessageParts from './MessageParts';
import Message from './Message';
import store from '~/store';

/** First-run sentinel for `parentRef`: `messageId` itself may legitimately be
 *  null/undefined at the root level, so those can't mark "not yet bound". */
const UNBOUND_PARENT: unique symbol = Symbol('multiMessageUnboundParent');

function MessageRowSlot({
  depth,
  messageId,
  measureRow,
  mounted,
  placeholderHeight,
  searchContent,
  searchText,
  steerAnchors,
  pinRow,
  children,
}: {
  depth: number;
  messageId: string;
  measureRow?: (depth: number, messageId: string, height: number) => void;
  mounted: boolean;
  placeholderHeight?: number;
  searchContent: TMessage['content'];
  searchText: TMessage['text'];
  steerAnchors?: Array<{ id: string; text: string }>;
  pinRow?: (depth: number, messageId: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedSteerIdRef = useRef<string>();
  const transferMessageFocusRef = useRef(false);
  const searchableText = useMemo(
    () => serializeMessageForClipboard({ content: searchContent, text: searchText }),
    [searchContent, searchText],
  );

  useLayoutEffect(() => {
    if (!mounted) return;
    if (transferMessageFocusRef.current) {
      const target = document.getElementById(messageId);
      if (target && target !== ref.current) {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      transferMessageFocusRef.current = false;
    }
    const focusedSteerId = focusedSteerIdRef.current;
    if (!focusedSteerId) return;
    const target = document.getElementById(focusedSteerId);
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    focusedSteerIdRef.current = undefined;
  }, [messageId, mounted]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!mounted || !element || !measureRow) {
      return;
    }
    const measure = () => measureRow(depth, messageId, element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [depth, measureRow, messageId, mounted]);

  return (
    <div
      ref={ref}
      id={mounted ? undefined : messageId}
      className={mounted ? undefined : 'message-render w-full'}
      data-message-row-slot="true"
      data-row-mounted={String(mounted)}
      data-row-depth={depth}
      data-row-message-id={messageId}
      style={mounted ? undefined : { height: placeholderHeight }}
      onFocusCapture={(event) => {
        const focusedId = (event.target as HTMLElement).id;
        if (!mounted && event.target === event.currentTarget)
          transferMessageFocusRef.current = true;
        if (focusedId && steerAnchors?.some((steer) => steer.id === focusedId)) {
          focusedSteerIdRef.current = focusedId;
        }
        if (mounted) pinRow?.(depth, messageId);
      }}
      onBlurCapture={() => {
        if (mounted) return;
        transferMessageFocusRef.current = false;
        focusedSteerIdRef.current = undefined;
      }}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (
          mounted &&
          target.closest(
            'button, a, input, textarea, select, [role="button"], [contenteditable="true"]',
          )
        ) {
          pinRow?.(depth, messageId);
        }
      }}
    >
      {children}
      {!mounted
        ? [
            searchableText ? (
              <span key="search-text" className="sr-only" data-message-search-text="true">
                {searchableText}
              </span>
            ) : null,
            ...(steerAnchors?.map((steer) => (
              <span key={steer.id} id={steer.id} className="steer-render sr-only">
                <span className="message-content">{steer.text}</span>
              </span>
            )) ?? []),
          ]
        : null}
    </div>
  );
}

function MultiMessage({
  // messageId is used recursively here
  messageId,
  messagesTree,
  currentEditId,
  setCurrentEditId,
}: TMessageProps) {
  const [siblingIdx, setSiblingIdx] = useRecoilState(store.messagesSiblingIdxFamily(messageId));
  const activeSpeechMessageId = useAtomValue(activeSpeechMessageIdAtom);
  const selectedMessage = messagesTree?.[(messagesTree?.length ?? 0) - siblingIdx - 1];
  const rowMountState = useRowMountWindow(selectedMessage?.depth, selectedMessage?.messageId);

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
  const parentRef = useRef<string | null | undefined | typeof UNBOUND_PARENT>(UNBOUND_PARENT);

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
    const prevTree = treeRef.current;
    const treeChanged = prevTree !== messagesTree;
    treeRef.current = messagesTree;
    const parentChanged = parentRef.current !== messageId;
    parentRef.current = messageId;
    if (!messagesTree || length === 0) {
      displayedRef.current = {};
      return;
    }
    const newestId = messagesTree[length - 1]?.messageId;
    const currentIdx = siblingIdxRef.current;

    if (parentChanged) {
      /** Recursive instances are deliberately unkeyed and get REUSED across
       *  parents when an ancestor's branch switches: the refs still describe
       *  the PREVIOUS parent's children, so reconciling against them would
       *  wipe this parent's saved selection. Rebind to this parent's own atom
       *  value (clamped) instead of reconciling. */
      const boundIdx = currentIdx >= length ? 0 : currentIdx;
      if (boundIdx !== currentIdx) {
        setSiblingIdx(boundIdx);
      }
      displayedRef.current = {
        newestId,
        viewedId: messagesTree[length - boundIdx - 1]?.messageId,
      };
      return;
    }

    if (!treeChanged) {
      displayedRef.current = {
        newestId,
        viewedId: messagesTree[length - currentIdx - 1]?.messageId,
      };
      return;
    }

    const previous = displayedRef.current;
    /** An append means the last child is a NEW member (absent from the
     *  previous array) while the prior newest survived. A changed last id
     *  alone can also be a same-membership REORDER (sibling `createdAt` ties
     *  have no sort tie-breaker) or a RE-KEY (a streaming id hydrating to its
     *  durable id at finalize) — neither is a new branch to follow. */
    const appendedNewest =
      previous.newestId == null ||
      (newestId !== previous.newestId &&
        prevTree != null &&
        !prevTree.some((message) => message?.messageId === newestId) &&
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
  }, [messageId, messagesTree, siblingIdx, setSiblingIdx]);

  if (!(messagesTree && messagesTree.length)) {
    return null;
  }

  const currentSiblingIdx = messagesTree.length - siblingIdx - 1;
  const message = selectedMessage as TMessage | undefined;

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

  const depth = message.depth ?? 0;
  const measuredRow = rowMountState.measuredRow;
  /** A bounded row with no measurement must render once before it can become
   *  an exact-height slot. Editing also pins the row so local form state is
   *  never released while the editor is active. */
  const rowMounted =
    rowMountState.windowMounted ||
    currentEditId === message.messageId ||
    activeSpeechMessageId === message.messageId;

  let row: ReactElement | null = null;
  if (!rowMounted) {
    row = null;
  } else if (isAssistantsEndpoint(message.endpoint) && message.content) {
    row = <MessageParts {...sharedProps} />;
  } else if (message.content) {
    row = <MessageContent {...sharedProps} />;
  } else {
    row = <Message {...sharedProps} />;
  }
  /** Event children may be persisted against the user request that launched
   * the Director. Once its assistant response exists, present that activity
   * after the response instead of interrupting the turn between user and
   * assistant rows. Exact assistant-owned children remain in the same group. */
  let activityParentMessageIds: string[] = [];
  if (message.isCreatedByUser) {
    if (!message.children?.length) activityParentMessageIds = [message.messageId];
  } else {
    activityParentMessageIds = [message.messageId, message.parentMessageId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
  }
  const isEditingActivityAnchor =
    typeof currentEditId === 'string' && activityParentMessageIds.includes(currentEditId);
  const hasParallelContent =
    !message.isCreatedByUser && message.content?.some((part) => part?.groupId != null) === true;

  const steerAnchors = message.content?.flatMap((part) => {
    if (part?.type !== ContentTypes.STEER || !part.steerId) return [];
    return [{ id: `steer-${part.steerId}`, text: part[ContentTypes.STEER] }];
  });
  let rowSlot: ReactElement | null = null;
  if (rowMounted || (rowMountState.mode === 'bounded' && measuredRow)) {
    rowSlot = (
      <MessageRowSlot
        depth={depth}
        messageId={message.messageId}
        mounted={rowMounted}
        placeholderHeight={measuredRow?.height}
        searchContent={message.content}
        searchText={message.text}
        steerAnchors={steerAnchors}
        measureRow={rowMountState.measureRow}
        pinRow={rowMountState.pinRow}
      >
        {rowMounted ? row : null}
        {rowMounted && !isEditingActivityAnchor && activityParentMessageIds.length > 0 ? (
          <div className="w-full border-0 bg-transparent">
            <EventSubagentActivityGroup
              conversationId={message.conversationId ?? ''}
              parentMessageIds={activityParentMessageIds}
              hasParallelContent={hasParallelContent}
            />
          </div>
        ) : null}
      </MessageRowSlot>
    );
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
      {rowSlot}
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
