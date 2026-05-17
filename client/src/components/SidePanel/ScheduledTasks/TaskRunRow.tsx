import { useCallback, useEffect, useRef, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import { Archive, CopyPlus, Ellipsis, ExternalLink, Share2, Trash } from 'lucide-react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import {
  useArchiveConvoMutation,
  useDeleteConversationMutation,
  useDuplicateConversationMutation,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { cn } from '~/utils';

interface TaskRunRowProps {
  conversation: TConversation;
  /** Called when the user opens this run; parent should dismiss the modal. */
  onOpen: () => void;
  /** Called when the user picks "Share"; parent should close the modal and
   *  mount its own ShareButton with this conversation id. */
  onRequestShare: (conversationId: string, title: string) => void;
}

/** Reset window for the inline two-click delete confirmation. */
const DELETE_CONFIRM_RESET_MS = 2500;

/**
 * Compact run timestamp. Same-day → "9:32 PM", same-year → "Apr 15",
 * older → "Apr 15, 2024". The parent DateLabel already disambiguates the
 * group (Today / Yesterday / ...), so the shorter form is enough inline;
 * the full ISO datetime lives in the row's `title` attribute for tooltips.
 */
function formatRunTime(value: string | Date | undefined): { short: string; full: string } {
  if (!value) return { short: '', full: '' };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { short: '', full: '' };
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  const short = sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(
        undefined,
        sameYear
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' },
      );
  return { short, full: date.toLocaleString() };
}

/**
 * Self-contained row used inside the Task Runs modal. Visually mirrors the
 * chat sidebar entry (endpoint icon, single-line title, hover affordances)
 * but ships its own menu so that nothing inside the row depends on the
 * Convo/ConvoOptions chain, the Recoil/chat-context state, or a portalled
 * popover that fights the parent Radix Dialog's outside-click logic.
 *
 * The menu uses `portal={false}` so its DOM lives inside the dialog tree —
 * Radix simply never sees a click on a menu item as "outside". Share opens
 * an OGDialog whose depth-based z-index sits below the modal, so it's
 * delegated up to the parent which closes the modal first.
 */
export default function TaskRunRow({ conversation, onOpen, onRequestShare }: TaskRunRowProps) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();

  const conversationId = conversation.conversationId ?? '';
  const title = (conversation.title ?? '').trim();
  const displayTitle = title.length > 0 ? title : localize('com_ui_untitled');
  const runTime = formatRunTime(conversation.createdAt ?? conversation.updatedAt);

  const menuStore = Ariakit.useMenuStore({ focusLoop: true });
  const isMenuOpen = menuStore.useState('open');

  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const archiveMutation = useArchiveConvoMutation();
  const duplicateMutation = useDuplicateConversationMutation({
    onSuccess: (data) => {
      onOpen();
      navigateToConvo(data.conversation);
      showToast({
        message: localize('com_ui_duplication_success'),
        severity: NotificationSeverity.SUCCESS,
        showIcon: true,
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_duplication_error'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
    },
  });
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

  const sharedLinksEnabled = startupConfig?.sharedLinksEnabled === true;
  const isDuplicateLoading = duplicateMutation.isLoading;
  const isArchiveLoading = archiveMutation.isLoading;
  const isDeleteLoading = deleteMutation.isLoading;

  const handleOpen = useCallback(() => {
    if (!conversationId) return;
    if (title.length > 0) {
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

  const handleShareClick = useCallback(() => {
    if (!conversationId) return;
    menuStore.hide();
    onRequestShare(conversationId, displayTitle);
  }, [conversationId, displayTitle, menuStore, onRequestShare]);

  const handleDuplicateClick = useCallback(() => {
    if (!conversationId || isDuplicateLoading) return;
    duplicateMutation.mutate({ conversationId });
    menuStore.hide();
  }, [conversationId, duplicateMutation, isDuplicateLoading, menuStore]);

  const handleArchiveClick = useCallback(() => {
    if (!conversationId || isArchiveLoading) return;
    archiveMutation.mutate(
      { conversationId, isArchived: true },
      {
        onSuccess: () => {
          showToast({
            message: localize('com_ui_convo_archived'),
            severity: NotificationSeverity.SUCCESS,
            showIcon: true,
          });
        },
        onError: () => {
          showToast({
            message: localize('com_ui_archive_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
    menuStore.hide();
  }, [archiveMutation, conversationId, isArchiveLoading, localize, menuStore, showToast]);

  const handleDeleteClick = useCallback(() => {
    if (!conversationId || isDeleteLoading) return;

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
  }, [conversationId, deleteMutation, isDeleteLoading, menuStore, pendingDelete, queryClient]);

  const itemClass =
    'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-text-primary outline-none hover:bg-surface-hover focus:bg-surface-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60';

  return (
    <div
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg outline-none transition-colors md:h-9',
        isMenuOpen ? 'bg-surface-active-alt' : 'hover:bg-surface-active-alt',
      )}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey) {
            handleOpenInNewTab();
            return;
          }
          handleOpen();
        }}
        aria-label={localize('com_ui_conversation_label', { title: displayTitle })}
      >
        <EndpointIcon
          conversation={conversation}
          endpointsConfig={endpointsConfig}
          size={20}
          context="menu-item"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{displayTitle}</span>
        {runTime.short && (
          <span
            className="ml-2 hidden shrink-0 whitespace-nowrap text-xs text-text-tertiary sm:inline"
            title={runTime.full}
          >
            {runTime.short}
          </span>
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
          <Ariakit.MenuItem className={itemClass} onClick={handleOpenInNewTab}>
            <ExternalLink className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            {localize('com_ui_open_in_new_tab')}
          </Ariakit.MenuItem>

          {sharedLinksEnabled && (
            <Ariakit.MenuItem className={itemClass} onClick={handleShareClick}>
              <Share2 className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              {localize('com_ui_share')}
            </Ariakit.MenuItem>
          )}

          <Ariakit.MenuItem
            className={itemClass}
            disabled={isDuplicateLoading}
            hideOnClick={false}
            onClick={handleDuplicateClick}
          >
            <CopyPlus className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            {localize('com_ui_duplicate')}
          </Ariakit.MenuItem>

          <Ariakit.MenuItem
            className={itemClass}
            disabled={isArchiveLoading}
            hideOnClick={false}
            onClick={handleArchiveClick}
          >
            <Archive className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            {localize('com_ui_archive')}
          </Ariakit.MenuItem>

          <Ariakit.MenuItem
            disabled={isDeleteLoading}
            hideOnClick={false}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
              pendingDelete
                ? 'bg-red-500/10 text-red-600 hover:bg-red-500/15 focus:bg-red-500/15 dark:text-red-400'
                : 'text-text-primary hover:bg-surface-hover focus:bg-surface-hover',
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
            {pendingDelete ? localize('com_ui_confirm_delete') : localize('com_ui_delete')}
          </Ariakit.MenuItem>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
    </div>
  );
}
