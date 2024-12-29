import { useState } from 'react';
import type { FC } from 'react';
import type { TConversationTag } from 'librechat-data-provider';
import BookmarkEditDialog from './BookmarkEditDialog';
import { TooltipAnchor } from '~/components/ui';
import { EditIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';

const EditBookmarkButton: FC<{
  bookmark: TConversationTag;
  tabIndex?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ bookmark, tabIndex = 0, onFocus, onBlur }) => {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      setOpen(!open);
    }
  };

  return (
    <>
      <BookmarkEditDialog
        context="EditBookmarkButton"
        bookmark={bookmark}
        open={open}
        setOpen={setOpen}
      />
      <TooltipAnchor
        role="button"
        aria-label={localize('com_ui_bookmarks_edit')}
        description={localize('com_ui_edit')}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={() => setOpen(!open)}
        className="flex size-7 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-surface-hover"
        onKeyDown={handleKeyDown}
      >
        <EditIcon />
      </TooltipAnchor>
    </>
  );
};

export default EditBookmarkButton;
