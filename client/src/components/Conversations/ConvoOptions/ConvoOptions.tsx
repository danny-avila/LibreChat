import { Ellipsis, Share2, Archive, Pen, Trash } from 'lucide-react';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import {
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import ArchiveButton from './ArchiveButton';
import DeleteButton from './DeleteButton';
import ShareButton from './ShareButton';
import { useLocalize } from '~/hooks';

export default function Conversation({
  conversation,
  retainView,
  renameHandler,
  setIsPopoverActive,
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const { conversationId, title } = conversation;

  return (
    <DropdownMenu onOpenChange={setIsPopoverActive}>
      <DropdownMenuTrigger asChild>
        <Button
          id="conversation-menu-button"
          aria-label="conversation-menu-button"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="z-10 h-7 w-7 border-none p-0 transition-all duration-300 ease-in-out"
        >
          <Ellipsis className="icon-md dark:text-gray-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-10 mt-2 w-36 rounded-lg"
        collisionPadding={2}
        align="center"
      >
        <DropdownMenuItem className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              renameHandler(e);
            }}
            className="flex items-center"
          >
            <Pen className="mr-2 h-4 w-4" />
            <span>{localize('com_ui_rename')}</span>
          </button>
        </DropdownMenuItem>
        {startupConfig && startupConfig.sharedLinksEnabled && (
          <DropdownMenuItem className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700">
            <ShareButton conversationId={conversationId} title={title}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="flex items-center"
              >
                <Share2 className="mr-2 h-4 w-4" />
                <span>{localize('com_ui_share')}</span>
              </button>
            </ShareButton>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
        >
          <ArchiveButton
            conversationId={conversationId}
            retainView={retainView}
            shouldArchive={true}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="flex items-center"
            >
              <Archive className="mr-2 h-4 w-4" />
              <span>{localize('com_ui_archive')}</span>
            </button>
          </ArchiveButton>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
        >
          <DeleteButton conversationId={conversationId} retainView={retainView} title={title}>
            <button
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="flex items-center"
            >
              <Trash className="mr-2 h-4 w-4" />
              <span>{localize('com_ui_delete')}</span>
            </button>
          </DeleteButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
