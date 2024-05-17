import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import type { TConversation } from 'librechat-data-provider';
import DropDownMenu from '../Conversations/DropDownMenu';
import ShareButton from '../Conversations/ShareButton';
import HoverToggle from '../Conversations/HoverToggle';
import ExportButton from './ExportButton';
import store from '~/store';

export default function ExportAndShareMenu() {
  const location = useLocation();

  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  if (!exportable) {
    return <></>;
  }

  const isActiveConvo = exportable;

  return (
    <HoverToggle
      isActiveConvo={!!isActiveConvo}
      isPopoverActive={isPopoverActive}
      setIsPopoverActive={setIsPopoverActive}
    >
      <DropDownMenu
        icon={<Upload />}
        tooltip="Export/Share"
        className="pointer-cursor relative z-50 flex h-[40px] min-w-4 flex-none flex-col items-center justify-center rounded-md border border-gray-100 bg-white px-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-0 focus:ring-offset-0 radix-state-open:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700 sm:text-sm"
      >
        {conversation && conversation.conversationId && (
          <>
            <ExportButton conversation={conversation} setPopoverActive={setIsPopoverActive} />
            <ShareButton
              conversationId={conversation.conversationId}
              title={conversation.title ?? ''}
              appendLabel={true}
              className="mb-[3.5px]"
              setPopoverActive={setIsPopoverActive}
            />
          </>
        )}
      </DropDownMenu>
    </HoverToggle>
  );
}
