import { Bookmark } from 'lucide-react';
import { useLocalize } from '~/hooks';

interface BookmarkEmptyStateProps {
  isFiltered?: boolean;
}

export default function BookmarkEmptyState({ isFiltered = false }: BookmarkEmptyStateProps) {
  const localize = useLocalize();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border-light bg-transparent p-6 text-center">
      <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-tertiary">
        <Bookmark className="size-5 text-text-secondary" aria-hidden="true" />
      </div>
      {isFiltered ? (
        <p className="text-sm text-text-secondary">{localize('com_ui_no_bookmarks_match')}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-text-primary">
            {localize('com_ui_no_bookmarks_title')}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {localize('com_ui_add_first_bookmark')}
          </p>
        </>
      )}
    </div>
  );
}
