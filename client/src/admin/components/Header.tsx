import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Icon } from '~/admin/ui';

/**
 * Page header: title and page actions (portaled into `#header-actions-portal`).
 * When the actions don't fit beside the title they wrap onto a second row,
 * and the title truncates instead of being overlapped.
 */
export function Header({ title, onSearchClick, children }: t.HeaderProps) {
  const localize = useLocalize();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <header className="shrink-0 border-b border-(--cui-color-stroke-default) bg-(--cui-color-background-panel)">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <div className="flex min-w-28 flex-1 basis-auto">
          {title ? (
            <h1
              className="m-0 min-w-0 truncate text-base font-bold text-(--cui-color-text-default)"
              title={title}
            >
              {title}
            </h1>
          ) : (
            <div />
          )}
        </div>
        <div className="ml-auto flex max-w-full min-w-0 items-center justify-end gap-2">
          {children}
          <div id="header-actions-portal" className="contents" />
          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              aria-label={localize('com_admin_cmdk_label')}
              title={`${localize('com_admin_ui_search')} (${shortcut})`}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-(--cui-color-stroke-default) bg-transparent px-2.5 py-1.5 text-sm text-(--cui-color-text-muted) transition-colors hover:border-(--cui-color-stroke-intense) hover:text-(--cui-color-text-default) sm:px-3"
            >
              <span aria-hidden="true" className="flex sm:hidden">
                <Icon name="search" size="sm" />
              </span>
              <span className="hidden sm:inline">{localize('com_admin_ui_search')}</span>
              <kbd className="hidden rounded border border-(--cui-color-stroke-default) bg-(--cui-color-background-secondary) px-1.5 py-0.5 text-xs font-medium text-(--cui-color-text-default) sm:inline">
                {shortcut}
              </kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
