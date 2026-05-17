import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { Ellipsis, ExternalLink, Pen, Trash } from 'lucide-react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import {
  useGetEndpointsQuery,
  useUpdateConversationMutation,
  useDeleteConversationMutation,
} from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useNavigateToConvo, useLocalize } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { cn, logger } from '~/utils';

interface TaskRunRowProps {
  conversation: TConversation;
  /**
   * Called once the run has been "opened" — the parent should close the
   * modal so the user lands on the run's chat view.
   */
  onOpen: () => void;
}

/** Reset window for the inline two-click delete confirmation. */
const DELETE_CONFIRM_RESET_MS = 2500;

/**
 * Self-contained row used inside the Task Runs modal. Visually mirrors the
 * chat sidebar entry (endpoint icon, single-line title, hover affordances)
 * but ships its own menu so that nothing inside the row depends on the
 * Convo/ConvoOptions chain, the Recoil/chat-context state, or a portalled
 * popover that fights the parent Radix Dialog's outside-click logic.
 *
 * The menu uses `portal={false}` so its DOM lives inside the dialog tree —
 * Radix simply never sees a click on a menu item as "outside".
 */
export default function TaskRunRow({ conversation, onOpen }: TaskRunRowProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const conversationId = conversation.conversationId ?? '';
  const title = (conversation.title ?? '').trim();
  const displayTitle = title.length > 0 ? title : localize('com_ui_untitled');

  const menuStore = Ariakit.useMenuStore({ focusLoop: true });
  const isMenuOpen = menuStore.useState('open');

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle);
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitleDraft(displayTitle);
  }, [displayTitle]);

  useEffect(() => {
    if (!isMenuOpen) {
      setPendingDelete(false);
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
        deleteTimerRef.current = null;
      }
    }
  }, [isMenuOpen]);

  useEffect(
    () => () => {
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current);
      }
    },
    [],
  );

  const updateMutation = useUpdateConversationMutation(conversationId);
  const deleteMutation = useDeleteConversationMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_convo_delete_success'),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_convo_delete_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });

  const handleOpen = useCallback(() => {
    if (!conversationId) return;
    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }
    onOpen();
    navigateToConvo(conversation);
  }, [conversation, conversationId, navigateToConvo, onOpen, title]);

  const handleOpenInNewTab = useCallback(() => {
    if (!conversationId) return;
    window.open(`${window.location.origin}/c/${conversationId}`, '_blank', 'noopener,noreferrer');
    menuStore.hide();
  }, [conversationId, menuStore]);

  const handleStartRename = useCallback(() => {
    setTitleDraft(displayTitle);
    setRenaming(true);
    menuStore.hide();
  }, [displayTitle, menuStore]);

  const submitRename = useCallback(async () => {
    const next = titleDraft.trim();
    if (!conversationId || next === '' || next === displayTitle) {
      setRenaming(false);
      setTitleDraft(displayTitle);
      return;
    }
    try {
      await updateMutation.mutateAsync({ conversationId, title: next });
      setRenaming(false);
    } catch (err) {
      logger.error('Failed to rename task run', err);
      setTitleDraft(displayTitle);
      setRenaming(false);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    }
  }, [conversationId, displayTitle, localize, showToast, titleDraft, updateMutation]);

  const cancelRename = useCallback(() => {
    setTitleDraft(displayTitle);
    setRenaming(false);
  }, [displayTitle]);

  const handleDeleteClick = useCallback(() => {
    if (!conversationId) return;

    if (!pendingDelete) {
      setPendingDelete(true);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => setPendingDelete(false), DELETE_CONFIRM_RESET_MS);
      return;
    }

    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setPendingDelete(false);
    menuStore.hide();

    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, conversationId]);
    const lastMessage = messages?.[messages.length - 1];
    deleteMutation.mutate({
      conversationId,
      thread_id: lastMessage?.thread_id,
      endpoint: lastMessage?.endpoint,
      source: 'button',
    });
  }, [conversationId, deleteMutation, menuStore, pendingDelete, queryClient]);

  const isDeleteDisabled = deleteMutation.isLoading;

  return (
    <div
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg outline-none transition-colors',
        'focus-within:bg-surface-active-alt md:h-9',
        isMenuOpen ? 'bg-surface-active-alt' : 'hover:bg-surface-active-alt',
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        onClick={(event) => {
          if (renaming) return;
          if (event.metaKey || event.ctrlKey) {
            handleOpenInNewTab();
            return;
          }
          handleOpen();
        }}
        disabled={renaming}
        aria-label={localize('com_ui_conversation_label', { title: displayTitle })}
      >
        <EndpointIcon
          conversation={conversation}
          endpointsConfig={endpointsConfig}
          size={20}
          context="menu-item"
        />
        {renaming ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitRename();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelRename();
              }
            }}
            onBlur={() => void submitRename()}
            className="min-w-0 flex-1 truncate rounded-md border border-border-medium bg-surface-primary px-1.5 py-0.5 text-sm text-text-primary outline-none focus:border-text-primary"
            aria-label={localize('com_ui_rename_conversation')}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{displayTitle}</span>
        )}
      </button>

      <Ariakit.MenuProvider store={menuStore}>
        <Ariakit.MenuButton
          className={cn(
            'mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary outline-none transition-opacity',
            'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring-primary',
            isMenuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
          aria-label={localize('com_nav_convo_menu_options')}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </Ariakit.MenuButton>
        <Ariakit.Menu
          portal={false}
          gutter={4}
          className="popover-ui z-[1100] min-w-[180px] py-1"
        >
          <Ariakit.MenuItem
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-hover focus:bg-surface-hover"
            onClick={handleOpenInNewTab}
          >
            <ExternalLink className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            {localize('com_ui_open_in_new_tab')}
          </Ariakit.MenuItem>
          <Ariakit.MenuItem
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-hover focus:bg-surface-hover"
            onClick={handleStartRename}
          >
            <Pen className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            {localize('com_ui_rename')}
          </Ariakit.MenuItem>
          <Ariakit.MenuItem
            disabled={isDeleteDisabled}
            hideOnClick={false}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none',
              pendingDelete
                ? 'bg-red-500/10 text-red-600 hover:bg-red-500/15 focus:bg-red-500/15 dark:text-red-400'
                : 'text-text-primary hover:bg-surface-hover focus:bg-surface-hover',
              isDeleteDisabled && 'cursor-not-allowed opacity-60',
            )}
            onClick={handleDeleteClick}
          >
            <Trash
              className={cn(
                'h-4 w-4',
                pendingDelete ? 'text-red-500 dark:text-red-400' : 'text-text-secondary',
              )}
              aria-hidden="true"
            />
            {pendingDelete
              ? localize('com_ui_confirm_delete')
              : localize('com_ui_delete')}
          </Ariakit.MenuItem>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
    </div>
  );
}
