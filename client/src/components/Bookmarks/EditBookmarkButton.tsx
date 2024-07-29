import type { FC } from 'react';
import type { TConversationTag } from 'librechat-data-provider';
import BookmarkEditDialog from './BookmarkEditDialog';
import { EditIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';

const EditBookmarkButton: FC<{
  bookmark: TConversationTag;
  tabIndex?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ bookmark, tabIndex = 0, onFocus, onBlur }) => {
  const localize = useLocalize();
  return (
    <BookmarkEditDialog
      bookmark={bookmark}
      trigger={
        <button
          type="button"
          className="transition-color flex h-7 w-7 min-w-7 items-center justify-center rounded-lg duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
          tabIndex={tabIndex}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <EditIcon />
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
