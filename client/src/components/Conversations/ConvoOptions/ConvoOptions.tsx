import { useState, useId } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Ellipsis, Share2, Copy, Archive, Pen, Trash } from 'lucide-react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { MouseEvent } from 'react';
import { useLocalize, useArchiveHandler, useNavigateToConvo } from '~/hooks';
import { useToastContext, useChatContext } from '~/Providers';
import { useDuplicateConversationMutation } from '~/data-provider';
import { DropdownPopup } from '~/components/ui';
import DeleteButton from './DeleteButton';
import ShareButton from './ShareButton';
import { cn } from '~/utils';

export default function ConvoOptions({
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
  const archiveHandler = useArchiveHandler(conversationId, true, retainView);
  const { navigateToConvo } = useNavigateToConvo(index);
  const { showToast } = useToastContext();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const duplicateConversation = useDuplicateConversationMutation({
    onSuccess: (data) => {
      if (data != null) {
        navigateToConvo(data.conversation);
        showToast({
          message: localize('com_ui_duplication_success'),
          status: 'success',
        });
      }
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
    setIsPopoverActive(false);
    setShowShareDialog(true);
  };

  const deleteHandler = () => {
    setIsPopoverActive(false);
    setShowDeleteDialog(true);
  };

  const duplicateHandler = () => {
    setIsPopoverActive(false);
    duplicateConversation.mutate({
      conversationId: conversationId ?? '',
    });
  };

  const dropdownItems = [
    {
      label: localize('com_ui_share'),
      onClick: shareHandler,
      icon: <Share2 className="icon-sm mr-2 text-text-primary" />,
      show: startupConfig && startupConfig.sharedLinksEnabled,
    },
    {
      label: localize('com_ui_rename'),
      onClick: renameHandler,
      icon: <Pen className="icon-sm mr-2 text-text-primary" />,
    },
    {
      label: localize('com_ui_duplicate'),
      onClick: duplicateHandler,
      icon: <Copy className="icon-sm mr-2 text-text-primary" />,
    },
    {
      label: localize('com_ui_archive'),
      onClick: archiveHandler,
      icon: <Archive className="icon-sm mr-2 text-text-primary" />,
    },
    {
      label: localize('com_ui_delete'),
      onClick: deleteHandler,
      icon: <Trash className="icon-sm mr-2 text-text-primary" />,
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
            id="conversation-menu-button"
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
          title={title ?? ''}
          conversationId={conversationId ?? ''}
          showShareDialog={showShareDialog}
          setShowShareDialog={setShowShareDialog}
        />
      )}
      {showDeleteDialog && (
        <DeleteButton
          title={title ?? ''}
          retainView={retainView}
          conversationId={conversationId ?? ''}
          showDeleteDialog={showDeleteDialog}
          setShowDeleteDialog={setShowDeleteDialog}
        />
      )}
    </>
  );
}
