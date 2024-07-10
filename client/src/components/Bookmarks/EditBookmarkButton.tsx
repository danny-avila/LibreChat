import type { FC } from 'react';
import type { TConversationTag } from 'librechat-data-provider';
import BookmarkEditDialog from './BookmarkEditDialog';
import { EditIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
const EditBookmarkButton: FC<{ bookmark: TConversationTag }> = ({ bookmark }) => {
  const localize = useLocalize();
  return (
    <BookmarkEditDialog
      bookmark={bookmark}
      trigger={
        <button className="size-4 hover:text-gray-300 focus-visible:bg-gray-100 focus-visible:outline-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 dark:hover:bg-gray-600 dark:focus-visible:bg-gray-600">
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <EditIcon />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={0}>
                {localize('com_ui_edit')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </button>
      }
    />
  );
};

export default EditBookmarkButton;
