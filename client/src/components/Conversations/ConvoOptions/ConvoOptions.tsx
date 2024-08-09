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
import { cn } from '~/utils';

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
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            renameHandler(e);
          }}
          className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
        >
          <Pen className="mr-2 h-4 w-4" />
          <span>{localize('com_ui_rename')}</span>
        </DropdownMenuItem>
        {startupConfig && startupConfig.sharedLinksEnabled && (
          <ShareButton conversationId={conversationId} title={title}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
            >
              <Share2 className="mr-2 h-4 w-4" />
              <span>{localize('com_ui_share')}</span>
            </DropdownMenuItem>
          </ShareButton>
        )}

        <ArchiveButton conversationId={conversationId} retainView={retainView} shouldArchive={true}>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
          >
            <Archive className="mr-2 h-4 w-4" />
            <span>{localize('com_ui_archive')}</span>
          </DropdownMenuItem>
        </ArchiveButton>
        <DeleteButton conversationId={conversationId} retainView={retainView} title={title}>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="w-full cursor-pointer rounded-lg disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
          >
            <Trash className="mr-2 h-4 w-4" />
            <span>{localize('com_ui_delete')}</span>
          </DropdownMenuItem>
        </DeleteButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
