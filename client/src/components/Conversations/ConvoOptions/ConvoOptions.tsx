import { useState, useId, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, Share2, Copy, Archive, Pen, Trash } from 'lucide-react';
import type { MouseEvent } from 'react';
import type * as t from '~/common';
import {
  useDuplicateConversationMutation,
  useGetStartupConfig,
  useArchiveConvoMutation,
} from '~/data-provider';
import { useLocalize, useNavigateToConvo } from '~/hooks';
import useNewConvo from '~/hooks/useNewConvo';
import { useToastContext, useChatContext } from '~/Providers';
import { DropdownPopup, Spinner } from '~/components';
import DeleteButton from './DeleteButton';
import ShareButton from './ShareButton';
import { cn } from '~/utils';
import { NotificationSeverity } from '~/common';

function ConvoOptions({
  conversationId,
  title,
  retainView,
  renameHandler,
  isPopoverActive,
  setIsPopoverActive,
  isActiveConvo,
}: {
  conversationId: string | null;
  title: string | null;
  retainView: () => void;
  renameHandler: (e: MouseEvent) => void;
  isPopoverActive: boolean;
  setIsPopoverActive: React.Dispatch<React.SetStateAction<boolean>>;
  isActiveConvo: boolean;
}) {
  const localize = useLocalize();
  const { index } = useChatContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { navigateToConvo } = useNavigateToConvo(index);
  const { showToast } = useToastContext();

  const navigate = useNavigate();
  const { conversationId: currentConvoId } = useParams();
  const { newConversation } = useNewConvo();

  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const archiveConvoMutation = useArchiveConvoMutation();

  const archiveHandler = async () => {
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
  };

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

  const shareHandler = () => {
    setShowShareDialog(true);
  };

  const deleteHandler = () => {
    setShowDeleteDialog(true);
  };

  const duplicateHandler = () => {
    duplicateConversation.mutate({
      conversationId: conversationId ?? '',
    });
  };

  const isDuplicateLoading = duplicateConversation.isLoading;
  const isArchiveLoading = archiveConvoMutation.isLoading;

  const dropdownItems: t.MenuItemProps[] = [
    {
      label: localize('com_ui_share'),
      onClick: shareHandler,
      icon: <Share2 className="icon-sm mr-2 text-text-primary" />,
      show: startupConfig && startupConfig.sharedLinksEnabled,
      /** NOTE: THE FOLLOWING PROPS ARE REQUIRED FOR MENU ITEMS THAT OPEN DIALOGS */
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
      label: localize('com_ui_duplicate'),
      onClick: duplicateHandler,
      hideOnClick: false,
      icon: isDuplicateLoading ? (
        <Spinner className="size-4" />
      ) : (
        <Copy className="icon-sm mr-2 text-text-primary" />
      ),
    },
    {
      label: localize('com_ui_archive'),
      onClick: archiveHandler,
      hideOnClick: false,
      icon: isArchiveLoading ? (
        <Spinner className="size-4" />
      ) : (
        <Archive className="icon-sm mr-2 text-text-primary" />
      ),
    },
    {
      label: localize('com_ui_delete'),
      onClick: deleteHandler,
      icon: <Trash className="icon-sm mr-2 text-text-primary" />,
      hideOnClick: false,
      ref: deleteButtonRef,
      render: (props) => <button {...props} />,
    },
  ];

  const menuId = useId();

  return (
    <>
      <DropdownPopup
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <Menu.MenuButton
            id={`conversation-menu-${conversationId}`}
            aria-label={localize('com_nav_convo_menu_options')}
            className={cn(
              'z-30 inline-flex h-7 w-7 items-center justify-center gap-2 rounded-md border-none p-0 text-sm font-medium ring-ring-primary transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
              isActiveConvo === true
                ? 'opacity-100'
                : 'opacity-0 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[open]:opacity-100',
            )}
          >
            <Ellipsis className="icon-md text-text-secondary" aria-hidden={true} />
          </Menu.MenuButton>
        }
        items={dropdownItems}
        menuId={menuId}
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
          conversationId={conversationId ?? ''}
          showDeleteDialog={showDeleteDialog}
          setShowDeleteDialog={setShowDeleteDialog}
          triggerRef={deleteButtonRef}
        />
      )}
    </>
  );
}

export default memo(ConvoOptions);
