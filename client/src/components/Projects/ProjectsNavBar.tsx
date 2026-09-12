import { useId, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { ArrowUpDown, Check, Plus, Search } from 'lucide-react';
import { Button, DropdownPopup, Input, useMediaQuery } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type ProjectSort = 'name' | 'createdAt' | 'lastConversationAt';

type ProjectsNavBarProps = {
  onCreate: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  sortBy: ProjectSort;
  onSortChange: (sortBy: ProjectSort) => void;
};

function renderSortMenuItem(label: string, isSelected: boolean): RenderProp {
  return function SortMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="truncate">{label}</span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

export default function ProjectsNavBar({
  onCreate,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
}: ProjectsNavBarProps) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const sortMenuId = useId();
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const sortOptions = useMemo(
    () => [
      { value: 'lastConversationAt' as const, label: localize('com_ui_latest_activity') },
      { value: 'createdAt' as const, label: localize('com_ui_sort_created') },
      { value: 'name' as const, label: localize('com_ui_name') },
    ],
    [localize],
  );
  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ??
    localize('com_ui_latest_activity');
  const sortMenuItems = useMemo<MenuItemProps[]>(
    () =>
      sortOptions.map((option) => {
        const isSelected = sortBy === option.value;
        return {
          id: `project-sort-${option.value}`,
          ariaLabel: option.label,
          ariaChecked: isSelected,
          onClick: () => onSortChange(option.value),
          render: renderSortMenuItem(option.label, isSelected),
        };
      }),
    [onSortChange, sortBy, sortOptions],
  );

  return (
    <header className="sticky top-0 z-10 border-b border-border-light bg-presentation">
      <div className="flex min-h-14 w-full flex-wrap items-center gap-2 px-4 py-2.5 md:min-h-16 md:flex-nowrap md:px-6">
        {isSmallScreen ? <OpenSidebar className="size-9 shrink-0" /> : null}
        <h1 className="sr-only">{localize('com_ui_projects')}</h1>
        <div className="relative order-last w-full min-w-0 md:order-none md:w-auto md:max-w-md md:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-text-tertiary"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={localize('com_ui_search_projects')}
            aria-label={localize('com_ui_search_projects')}
            className="bg-transparent pl-9"
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DropdownPopup
            portal={true}
            focusLoop={true}
            unmountOnHide={true}
            menuId={sortMenuId}
            isOpen={isSortMenuOpen}
            setIsOpen={setIsSortMenuOpen}
            className="z-[125] min-w-56"
            trigger={
              <Ariakit.MenuButton
                aria-label={localize('com_ui_sort_projects_by')}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors',
                  'hover:bg-surface-hover hover:text-text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
                  isSortMenuOpen && 'bg-surface-hover text-text-primary',
                )}
              >
                <ArrowUpDown className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedSortLabel}</span>
              </Ariakit.MenuButton>
            }
            items={sortMenuItems}
          />
          <Button type="button" variant="default" onClick={onCreate} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            {localize('com_ui_new_project')}
          </Button>
        </div>
      </div>
    </header>
  );
}
