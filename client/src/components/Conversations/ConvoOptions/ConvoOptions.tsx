import { useState, useId, useRef, memo, useCallback, useMemo } from 'react';
import * as Menu from '@ariakit/react/menu';
import { useParams, useNavigate } from 'react-router-dom';
import { DropdownPopup, Spinner, useToastContext } from '@librechat/client';
import { Ellipsis, Share2, Copy, Archive, Pen, Trash } from 'lucide-react';
import { BookmarkIcon } from '@radix-ui/react-icons';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { MouseEvent } from 'react';
import {
  useDuplicateConversationMutation,
  useGetStartupConfig,
  useArchiveConvoMutation,
} from '~/data-provider';
import { useLocalize, useNavigateToConvo, useNewConvo, useHasAccess } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useChatContext } from '~/Providers';
import DeleteButton from './DeleteButton';
import ShareButton from './ShareButton';
import BookmarkButton from './BookmarkButton';
import { cn } from '~/utils';

function ConvoOptions({
  conversationId,
  title,
  tags,
  isTemporary,
  retainView,
  renameHandler,
  isPopoverActive,
  setIsPopoverActive,
  isActiveConvo,
  toggleNav,
}: {
  conversationId: string | null;
  title: string | null;
  tags?: string[];
  isTemporary?: boolean;
  retainView: () => void;
  renameHandler: (e: MouseEvent) => void;
  isPopoverActive: boolean;
  setIsPopoverActive: React.Dispatch<React.SetStateAction<boolean>>;
  isActiveConvo: boolean;
  toggleNav?: () => void;
}) {
  const localize = useLocalize();
  const { index } = useChatContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { navigateToConvo } = useNavigateToConvo(index);
  const { showToast } = useToastContext();

  const navigate = useNavigate();
  const { conversationId: currentConvoId } = useParams();
  const { newConversation } = useNewConvo();

  const hasAccessToBookmarks = useHasAccess({
    permissionType: PermissionTypes.BOOKMARKS,
    permission: Permissions.USE,
  });

  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const bookmarkButtonRef = useRef<HTMLButtonElement>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);

  const archiveConvoMutation = useArchiveConvoMutation();

  const showBookmarkMenu = hasAccessToBookmarks === true && !isTemporary && conversationId != null;

  const duplicateConversation = useDuplicateConversationMutation({
    onSuccess: (data) => {
      navigateToConvo(data.conversation);
      showToast({
        message: localize('com_ui_duplication_success'),
        status: 'success',
      });
      setIsPopoverActive(false);
    },
    onMutate: () => {
      showToast({
        message: localize('com_ui_duplication_processing'),
        status: 'info',
      });
    },
    onError: () => {
      showToast({
        message: localize('com_ui_duplication_error'),
        status: 'error',
      });
    },
  });

  const isDuplicateLoading = duplicateConversation.isLoading;
  const isArchiveLoading = archiveConvoMutation.isLoading;

  const dismissNav = useCallback(() => {
    setIsPopoverActive(false);
    toggleNav?.();
  }, [setIsPopoverActive, toggleNav]);

  const handleShareClick = useCallback(() => {
    setShowShareDialog(true);
    dismissNav();
  }, [dismissNav]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteDialog(true);
    dismissNav();
  }, [dismissNav]);

  const handleBookmarkClick = useCallback(() => {
    setShowBookmarkDialog(true);
    dismissNav();
  }, [dismissNav]);

  const handleArchiveClick = useCallback(async () => {
    const convoId = conversationId ?? '';
    if (!convoId) {
      return;
    }

    archiveConvoMutation.mutate(
      { conversationId: convoId, isArchived: true },
      {
        onSuccess: () => {
          if (currentConvoId === convoId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
          retainView();
          setIsPopoverActive(false);
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
  }, [
    conversationId,
    currentConvoId,
    archiveConvoMutation,
    navigate,
    newConversation,
    retainView,
    setIsPopoverActive,
    showToast,
    localize,
  ]);

  const handleDuplicateClick = useCallback(() => {
    duplicateConversation.mutate({
      conversationId: conversationId ?? '',
    });
  }, [conversationId, duplicateConversation]);

  const dropdownItems = useMemo(
    () => [
      {
        label: localize('com_ui_share'),
        onClick: handleShareClick,
        icon: <Share2 className="icon-sm mr-2 text-text-primary" />,
        show: startupConfig && startupConfig.sharedLinksEnabled,
        hideOnClick: false,
        ref: shareButtonRef,
        render: (props) => <button {...props} />,
      },
      {
        label: localize('com_ui_rename'),
        onClick: renameHandler,
        icon: <Pen className="icon-sm mr-2 text-text-primary" />,
      },
      {
        label: localize('com_ui_bookmarks'),
        onClick: handleBookmarkClick,
        icon: <BookmarkIcon className="icon-sm mr-2 text-text-primary" />,
        show: showBookmarkMenu,
        hideOnClick: false,
        ref: bookmarkButtonRef,
        render: (props) => <button {...props} />,
      },
      {
        label: localize('com_ui_duplicate'),
        onClick: handleDuplicateClick,
        hideOnClick: false,
        icon: isDuplicateLoading ? (
          <Spinner className="size-4" />
        ) : (
          <Copy className="icon-sm mr-2 text-text-primary" />
        ),
      },
      {
        label: localize('com_ui_archive'),
        onClick: handleArchiveClick,
        hideOnClick: false,
        icon: isArchiveLoading ? (
          <Spinner className="size-4" />
        ) : (
          <Archive className="icon-sm mr-2 text-text-primary" />
        ),
      },
      {
        label: localize('com_ui_delete'),
        onClick: handleDeleteClick,
        icon: <Trash className="icon-sm mr-2 text-text-primary" />,
        hideOnClick: false,
        ref: deleteButtonRef,
        render: (props) => <button {...props} />,
      },
    ],
    [
      localize,
      handleShareClick,
      startupConfig,
      renameHandler,
      showBookmarkMenu,
      handleBookmarkClick,
      handleDuplicateClick,
      isDuplicateLoading,
      handleArchiveClick,
      isArchiveLoading,
      handleDeleteClick,
    ],
  );

  const menuId = useId();

  return (
    <>
      <DropdownPopup
        portal={true}
        mountByState={true}
        unmountOnHide={true}
        preserveTabOrder={true}
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <Menu.MenuButton
            id={`conversation-menu-${conversationId}`}
            aria-label={localize('com_nav_convo_menu_options')}
            aria-readonly={undefined}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center gap-2 rounded-md border-none p-0 text-sm font-medium ring-ring-primary transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50',
              isActiveConvo === true || isPopoverActive
                ? 'opacity-100'
                : 'opacity-0 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[open]:opacity-100',
            )}
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
          >
            <Ellipsis className="icon-md text-text-secondary" aria-hidden={true} />
          </Menu.MenuButton>
        }
        items={dropdownItems}
        menuId={menuId}
        className="z-[70]"
      />
      {showShareDialog && (
        <ShareButton
          conversationId={conversationId ?? ''}
          open={showShareDialog}
          onOpenChange={setShowShareDialog}
          triggerRef={shareButtonRef}
        />
      )}
      {showDeleteDialog && (
        <DeleteButton
          title={title ?? ''}
          retainView={retainView}
          triggerRef={deleteButtonRef}
          setMenuOpen={setIsPopoverActive}
          showDeleteDialog={showDeleteDialog}
          conversationId={conversationId ?? ''}
          setShowDeleteDialog={setShowDeleteDialog}
        />
      )}
      {showBookmarkDialog && conversationId != null && (
        <BookmarkButton
          conversationId={conversationId}
          tags={tags}
          open={showBookmarkDialog}
          onOpenChange={setShowBookmarkDialog}
          triggerRef={bookmarkButtonRef}
        />
      )}
    </>
  );
}

export default memo(ConvoOptions, (prevProps, nextProps) => {
  const prevTags = prevProps.tags ?? [];
  const nextTags = nextProps.tags ?? [];
  const tagsEqual =
    prevTags === nextTags ||
    (prevTags.length === nextTags.length && prevTags.every((t, i) => t === nextTags[i]));
  return (
    prevProps.conversationId === nextProps.conversationId &&
    prevProps.title === nextProps.title &&
    prevProps.isPopoverActive === nextProps.isPopoverActive &&
    prevProps.isActiveConvo === nextProps.isActiveConvo &&
    prevProps.isTemporary === nextProps.isTemporary &&
    tagsEqual
  );
});
