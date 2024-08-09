import { useState } from 'react';
import { Upload, Share2Icon } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import { ShareButton } from '~/components/Conversations/ConvoOptions';
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
  const [showExports, setShowExports] = useState(false);

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  if (!exportable) {
    return null;
  }

  const onOpenChange = (value: boolean) => {
    setShowExports(value);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id="export-menu-button"
          aria-label="Export options"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="border-xheavy z-10 mr-4 h-10 w-10 p-0 transition-all duration-300 ease-in-out focus-visible:ring focus-visible:ring-opacity-75 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          <Upload className="icon-md dark:text-gray-300" aria-hidden="true" focusable="false" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-10 mt-2 w-36 rounded-lg dark:bg-gray-800"
        collisionPadding={2}
        align="end"
        aria-label="Export and Share Menu"
      >
        {isSharedButtonEnabled && conversation.conversationId && (
          <ShareButton
            conversationId={conversation.conversationId}
            title={conversation.title ?? ''}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="w-full cursor-pointer rounded-lg focus-visible:bg-gray-700 focus-visible:ring focus-visible:ring-opacity-75 disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
            >
              <Share2Icon className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
              <span>{localize('com_ui_share')}</span>
            </DropdownMenuItem>
          </ShareButton>
        )}

        <DropdownMenuItem
          onClick={() => {
            onOpenChange(true);
          }}
          className="w-full cursor-pointer rounded-lg focus-visible:bg-gray-700 focus-visible:ring focus-visible:ring-opacity-75 disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
        >
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" />
          <span>{localize('com_endpoint_export')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
      {showExports && (
        <ExportModal
          open={showExports}
          onOpenChange={onOpenChange}
          conversation={conversation}
          aria-label="Export conversation modal"
        />
      )}
    </DropdownMenu>
  );
}
