import React, { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDrag } from 'react-dnd';
import { useRecoilValue } from 'recoil';
import { Link2, PinOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { Button, Spinner, TooltipAnchor, useToastContext, useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import type { ConversationDragItem } from './dnd';
import {
  useGetStartupConfig,
  usePinConversationMutation,
  useUpdateConversationMutation,
} from '~/data-provider';
import { useNavigateToConvo, useLocalize, useShiftKey } from '~/hooks';
import ConversationEndpointIcon from './ConversationEndpointIcon';
import { focusableInRow, resolveRowBeside } from './focus';
import { areConversationRenderPropsEqual } from './utils';
import { cn, logger, setDocumentTitle } from '~/utils';
import { NotificationSeverity } from '~/common';
import { CONVERSATION_DRAG_TYPE } from './dnd';
import ConvoActions from './ConvoActions';
import RenameForm from './RenameForm';
import ConvoLink from './ConvoLink';
import store from '~/store';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: (afterSlide?: () => void) => void;
  isGenerating?: boolean;
  /** Sidebar rows double as drag sources for filing the chat into a project;
   *  other surfaces leave this off. */
  draggable?: boolean;
  /** Lets a wrapper that owns its own drag source release it while the title is
   *  being edited, the way this row releases its own. */
  onRenamingChange?: (renaming: boolean) => void;
  /** Shortcuts an owning list handles for this row, declared on its focusable
   *  element so they are announced rather than left to be discovered. */
  keyShortcuts?: string;
}

function Conversation({
  conversation,
  retainView,
  toggleNav,
  isGenerating = false,
  draggable = false,
  onRenamingChange,
  keyShortcuts,
}: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const unpinMutation = usePinConversationMutation();
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  /* A deployment with shared links off leaves existing links in the database but stops
     serving them, so the row must not advertise one that no longer resolves. */
  const { data: startupConfig } = useGetStartupConfig();
  const sharedLinksEnabled = startupConfig?.sharedLinksEnabled === true;
  const isSharedBadgeVisible = conversation.isShared === true && sharedLinksEnabled;
  const isShiftHeld = useShiftKey();
  const { conversationId, title = '' } = conversation;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenamingState] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  // Lazy-load ConvoOptions to avoid running heavy hooks for all conversations
  const [hasInteracted, setHasInteracted] = useState(false);

  const previousTitle = useRef(title);
  const containerRef = useRef<HTMLDivElement>(null);

  const onRenamingChangeRef = useRef(onRenamingChange);
  onRenamingChangeRef.current = onRenamingChange;

  const setRenaming = useCallback((next: boolean) => {
    setRenamingState(next);
    onRenamingChangeRef.current?.(next);
  }, []);

  /* A row can be removed mid-rename, for instance by unpinning the same chat
   * from the project list that renders it too. Without this the owner would
   * keep treating the row as renaming and, once it came back, leave its drag
   * source released for the rest of the section's life. */
  useEffect(
    () => () => {
      onRenamingChangeRef.current?.(false);
    },
    [],
  );

  /* HTML5 drag needs a hover-capable pointer: connecting the source on touch
   * stamps `draggable="true"` on the row, and iOS Safari then hands taps to the
   * drag recognizer instead of synthesizing a click, so the row would only
   * select on the second tap. A `draggable` ancestor also swallows drag-select
   * inside the rename input, so the source is released while renaming. */
  const canHoverPointer = useMediaQuery('(hover: hover)');
  const [, dragConnector] = useDrag<ConversationDragItem, unknown, unknown>({
    type: CONVERSATION_DRAG_TYPE,
    item: () => ({
      conversationId: conversationId ?? '',
      chatProjectId: conversation.chatProjectId ?? null,
      pinned: conversation.pinned === true,
    }),
  });
  dragConnector(draggable && canHoverPointer && !renaming ? containerRef : null);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleMouseEnter = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  }, [hasInteracted]);

  /* Matches the favorites' row-level unpin: one click on the pin badge, no
   * menu digging. The row unmounts once the pinned refetch lands, so focus is
   * handed to a neighbouring row first. Where that row is has to be resolved
   * before the mutation, not in its callback: by then the refetch may already
   * have unmounted this row and cleared the ref the search starts from. */
  const unpinConvo = useCallback(() => {
    if (!conversationId) {
      return;
    }
    const row = containerRef.current;
    /* Outside the pinned list there is no successor, because the row stays put.
     * The pin badge that had focus does not, though, so focus moves to the
     * row's own link rather than falling to the document. */
    const successor =
      row?.contains(document.activeElement) === true
        ? (resolveRowBeside(row) ?? focusableInRow(row))
        : null;
    unpinMutation.mutate(
      { conversationId, pinned: false },
      {
        onSuccess: () => {
          successor?.focus();
        },
        onError: () => {
          showToast({
            message: localize('com_ui_unpin_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  }, [conversationId, unpinMutation, showToast, localize]);

  const handleMouseLeave = useCallback(() => {
    if (!isPopoverActive) {
      setHasInteracted(false);
    }
  }, [isPopoverActive]);

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Don't reset if focus is moving to a child element within this container
      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }
      if (!isPopoverActive) {
        setHasInteracted(false);
      }
    },
    [isPopoverActive],
  );

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    setIsPopoverActive(open);
    if (!open) {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container && !container.contains(document.activeElement)) {
          setHasInteracted(false);
        }
      });
    }
  }, []);

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey && !isGenerating) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/c/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    /** The navigation rides `afterSlide`: run synchronously it flushes the
     * conversation-switch commit in the tap's task, stalling the drawer's
     * first frame — the exact delay the animated toggle exists to avoid. */
    toggleNav(() => {
      setDocumentTitle(title);

      navigateToConvo(conversation, {
        currentConvoId,
      });
    });
  };

  const convoOptionsProps = {
    title,
    isPinned: conversation.pinned,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    chatProjectId: conversation.chatProjectId,
    isPopoverActive,
    onOpenChange: handlePopoverOpenChange,
    isShiftHeld: isActiveConvo ? isShiftHeld : false,
  };

  const generatingSpinner = (
    <span role="img" aria-label={localize('com_ui_generating')}>
      <Spinner className="h-5 w-5 flex-shrink-0 text-text-primary" />
    </span>
  );

  let actionVisibilityClassName =
    'pointer-events-none max-w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:max-w-[60px] group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:max-w-[60px] group-hover:scale-x-100 group-hover:opacity-100';
  if (isGenerating) {
    actionVisibilityClassName = 'pointer-events-none w-5 scale-x-100 opacity-100';
  } else if (isPopoverActive || isActiveConvo || isSmallScreen) {
    /** Touch has no hover, so a reveal-on-hover menu is unreachable there. */
    actionVisibilityClassName = 'pointer-events-auto scale-x-100 opacity-100';
  }

  let actionWidthClassName = '';
  if (!isGenerating && !isPopoverActive && isActiveConvo && isShiftHeld) {
    actionWidthClassName = 'max-w-[60px]';
  } else if (!isGenerating) {
    actionWidthClassName = isSmallScreen ? 'max-w-[36px]' : 'max-w-[28px]';
  }

  let actionContent: React.ReactNode = null;
  if (isGenerating) {
    actionContent = generatingSpinner;
  } else if (!renaming) {
    actionContent = <ConvoActions {...convoOptionsProps} hasInteracted={hasInteracted} />;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary md:h-9',
        isActiveConvo || isPopoverActive
          ? 'bg-surface-active-alt before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-text-primary'
          : 'hover:bg-surface-active-alt',
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleBlur}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          isPopoverActive={isPopoverActive}
          isSharedBadgeVisible={isSharedBadgeVisible}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
          keyShortcuts={keyShortcuts}
        >
          <ConversationEndpointIcon conversation={conversation} size={20} context="menu-item" />
        </ConvoLink>
      )}
      {isSharedBadgeVisible && (
        <Link2 className="icon-sm mr-1 shrink-0 text-text-secondary" aria-hidden="true" />
      )}
      {conversation.pinned === true && (
        <TooltipAnchor
          description={localize('com_ui_unpin')}
          side="top"
          render={
            <Button
              variant="row-action"
              size="icon-xs"
              aria-label={localize('com_ui_unpin')}
              data-testid="convo-unpin-button"
              onClick={(e) => {
                e.stopPropagation();
                unpinConvo();
              }}
              className="mr-1 shrink-0 text-text-primary"
            >
              <PinOff className="size-4" aria-hidden="true" />
            </Button>
          }
        />
      )}
      <div
        className={cn(
          'mr-2 flex origin-left items-center justify-center',
          actionVisibilityClassName,
          actionWidthClassName,
        )}
        // Removing aria-hidden to fix accessibility issue: ARIA hidden element must not be focusable or contain focusable elements
        // but not sure what its original purpose was, so leaving the property commented out until it can be cleared safe to delete.
        // aria-hidden={!(isPopoverActive || isActiveConvo)}
      >
        {/* Only render ConvoOptions when user interacts (hover/focus) or for active conversation */}
        {actionContent}
      </div>
    </div>
  );
}

export default memo(Conversation, areConversationRenderPropsEqual);
