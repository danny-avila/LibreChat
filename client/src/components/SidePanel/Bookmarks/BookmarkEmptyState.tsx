import { Bookmark } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface BookmarkEmptyStateProps {
  isFiltered?: boolean;
}

export default function BookmarkEmptyState({ isFiltered = false }: BookmarkEmptyStateProps) {
  const localize = useLocalize();

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 rounded-full bg-surface-secondary p-3">
        <Bookmark className="size-6 text-text-tertiary" aria-hidden="true" />
      </div>
      <p className="text-sm text-text-secondary">
        {isFiltered ? localize('com_ui_no_bookmarks_match') : localize('com_ui_no_bookmarks')}
      </p>
    </div>
  );
}
