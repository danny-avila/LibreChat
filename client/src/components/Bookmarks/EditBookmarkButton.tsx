import { useState } from 'react';
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <BookmarkEditDialog bookmark={bookmark} open={open} setOpen={setOpen} />
      <button
        type="button"
        className="transition-color flex size-7 items-center justify-center rounded-lg duration-200 hover:bg-surface-hover"
        tabIndex={tabIndex}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={() => setOpen(!open)}
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
    </>
  );
};

export default EditBookmarkButton;
