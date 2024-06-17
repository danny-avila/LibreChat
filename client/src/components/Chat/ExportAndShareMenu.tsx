import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import DropDownMenu from '~/components/Conversations/DropDownMenu';
import ShareButton from '~/components/Conversations/ShareButton';
import HoverToggle from '~/components/Conversations/HoverToggle';
import useLocalize from '~/hooks/useLocalize';
import ExportButton from './ExportButton';
import store from '~/store';

export default function ExportAndShareMenu({
  isSharedButtonEnabled,
  className = '',
}: {
  isSharedButtonEnabled: boolean;
  className?: string;
}) {
  const localize = useLocalize();

  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  if (!exportable) {
    return null;
  }

  const isActiveConvo = exportable;

  return (
    <HoverToggle
      isActiveConvo={!!isActiveConvo}
      isPopoverActive={isPopoverActive}
      setIsPopoverActive={setIsPopoverActive}
      className={className}
    >
      <DropDownMenu
        icon={<Upload />}
        tooltip={localize('com_endpoint_export_share')}
        className="pointer-cursor relative z-50 flex h-[40px] min-w-4 flex-none flex-col items-center justify-center rounded-md border border-gray-100 bg-white px-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-0 focus:ring-offset-0 radix-state-open:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700 sm:text-sm"
      >
        {conversation && conversation.conversationId && (
          <>
            <ExportButton conversation={conversation} setPopoverActive={setIsPopoverActive} />
            {isSharedButtonEnabled && (
              <ShareButton
                conversationId={conversation.conversationId}
                title={conversation.title ?? ''}
                appendLabel={true}
                className="mb-[3.5px]"
                setPopoverActive={setIsPopoverActive}
              />
            )}
          </>
        )}
      </DropDownMenu>
    </HoverToggle>
  );
}
