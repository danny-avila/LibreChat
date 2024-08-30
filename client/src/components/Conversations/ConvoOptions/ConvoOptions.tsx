import { useState } from 'react';
import { Ellipsis, Share2, Archive, Pen, Trash } from 'lucide-react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { Button } from '~/components/ui';
import { useArchiveHandler } from './ArchiveButton';
import { DropdownPopup } from '~/components/ui';
import DeleteButton from './DeleteButton';
import ShareButton from './ShareButton';
import { useLocalize } from '~/hooks';

export default function ConvoOptions({
  conversation,
  retainView,
  renameHandler,
  isPopoverActive,
  setIsPopoverActive,
  isActiveConvo,
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const { conversationId, title } = conversation;
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const archiveHandler = useArchiveHandler(conversationId, true, retainView);

  const shareHandler = () => {
    setIsPopoverActive(false);
    setShowShareDialog(true);
  };

  const deleteHandler = () => {
    setIsPopoverActive(false);
    setShowDeleteDialog(true);
  };

  const dropdownItems = [
    {
      label: localize('com_ui_rename'),
      onClick: renameHandler,
      icon: <Pen className="icon-md mr-2 text-text-secondary" />,
    },
    {
      label: localize('com_ui_share'),
      onClick: shareHandler,
      icon: <Share2 className="icon-md mr-2 text-text-secondary" />,
      show: startupConfig && startupConfig.sharedLinksEnabled,
    },
    {
      label: localize('com_ui_archive'),
      onClick: archiveHandler,
      icon: <Archive className="icon-md mr-2 text-text-secondary" />,
    },
    {
      label: localize('com_ui_delete'),
      onClick: deleteHandler,
      icon: <Trash className="icon-md mr-2 text-text-secondary" />,
    },
  ];

  return (
    <>
      <DropdownPopup
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <Button
            id="conversation-menu-button"
            aria-label="conversation-menu-button"
            variant="link"
            className="z-10 h-7 w-7 border-none p-0 transition-all duration-200 ease-in-out"
          >
            <Ellipsis className="icon-md text-text-secondary" />
          </Button>
        }
        items={dropdownItems}
        className={`${
          isActiveConvo === true
            ? 'opacity-100'
            : 'opacity-0 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[open]:opacity-100'
        }`}
      />
      {showShareDialog && (
        <ShareButton
          conversationId={conversationId}
          title={title}
          showShareDialog={showShareDialog}
          setShowShareDialog={setShowShareDialog}
        />
      )}
      {showDeleteDialog && (
        <DeleteButton
          conversationId={conversationId}
          retainView={retainView}
          title={title}
          showDeleteDialog={showDeleteDialog}
          setShowDeleteDialog={setShowDeleteDialog}
        />
      )}
    </>
  );
}
