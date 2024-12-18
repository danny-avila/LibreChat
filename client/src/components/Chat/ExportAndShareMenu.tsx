import { useState, useId, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import * as Ariakit from '@ariakit/react';
import { Upload, Share2 } from 'lucide-react';
import { ShareButton } from '~/components/Conversations/ConvoOptions';
import { useMediaQuery, useLocalize } from '~/hooks';
import ExportModal from '~/components/Nav/ExportConversation/ExportModal';
import { DropdownPopup } from '~/components/ui';
import store from '~/store';

export default function ExportAndShareMenu({
  isSharedButtonEnabled,
}: {
  isSharedButtonEnabled: boolean;
}) {
  const localize = useLocalize();
  const [showExports, setShowExports] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const menuId = useId();
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const conversation = useRecoilValue(store.conversationByIndex(0));

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
      icon: <Upload className="icon-md mr-2 text-text-secondary" />,
    },
    {
      label: localize('com_ui_share'),
      onClick: shareHandler,
      icon: <Share2 className="icon-md mr-2 text-text-secondary" />,
      show: isSharedButtonEnabled,
    },
  ];

  return (
    <>
      <DropdownPopup
        menuId={menuId}
        isOpen={isPopoverActive}
        setIsOpen={setIsPopoverActive}
        trigger={
          <Ariakit.MenuButton
            ref={exportButtonRef}
            id="export-menu-button"
            aria-label="Export options"
            className="inline-flex size-10 items-center justify-center rounded-lg border border-border-light bg-transparent text-text-primary transition-all ease-in-out hover:bg-surface-tertiary disabled:pointer-events-none disabled:opacity-50 radix-state-open:bg-surface-tertiary"
          >
            <Upload className="icon-md text-text-secondary" aria-hidden="true" focusable="false" />
          </Ariakit.MenuButton>
        }
        items={dropdownItems}
        className={isSmallScreen ? '' : 'absolute right-0 top-0 mt-2'}
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
          triggerRef={exportButtonRef}
          aria-label={localize('com_ui_export_convo_modal')}
        />
      )}
    </>
  );
}
