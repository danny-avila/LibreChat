import { useState } from 'react';
import { Upload, Share2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { ShareButton } from '~/components/Conversations/ConvoOptions';
import { Button, DropdownPopup } from '~/components/ui';
import useLocalize from '~/hooks/useLocalize';
import { ExportModal } from '../Nav';
import store from '~/store';

export default function ExportAndShareMenu({
  isSharedButtonEnabled,
}: {
  isSharedButtonEnabled: boolean;
}) {
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const exportable =
    conversation &&
    conversation.conversationId != null &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  if (exportable === false) {
    return null;
  }

  const onOpenChange = (value: boolean) => {
    setShowExports(value);
  };

  const shareHandler = () => {
    setIsPopoverActive(false);
    setShowShareDialog(true);
  };

  const exportHandler = () => {
    setIsPopoverActive(false);
    setShowExports(true);
  };

  const dropdownItems = [
    {
      label: localize('com_endpoint_export'),
      onClick: exportHandler,
      icon: <Upload className="icon-md mr-2 dark:text-gray-300" />,
    },
    {
      label: localize('com_ui_share'),
      onClick: shareHandler,
      icon: <Share2 className="icon-md mr-2 dark:text-gray-300" />,
      show: isSharedButtonEnabled,
    },
  ];

  return (
    <>
      <DropdownPopup
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <Button
            id="export-menu-button"
            aria-label="Export options"
            variant="outline"
            className="mr-4 h-10 w-10 p-0 transition-all duration-300 ease-in-out"
          >
            <Upload className="icon-md dark:text-gray-300" aria-hidden="true" focusable="false" />
          </Button>
        }
        items={dropdownItems}
        anchor="bottom end"
      />
      {showShareDialog && conversation.conversationId != null && (
        <ShareButton
          conversationId={conversation.conversationId}
          title={conversation.title ?? ''}
          showShareDialog={showShareDialog}
          setShowShareDialog={setShowShareDialog}
        />
      )}
      {showExports && (
        <ExportModal
          open={showExports}
          onOpenChange={onOpenChange}
          conversation={conversation}
          aria-label="Export conversation modal"
        />
      )}
    </>
  );
}
