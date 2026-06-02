import { memo, useId, useMemo, useState, type FC, type ReactNode } from 'react';
import * as Ariakit from '@ariakit/react';
import { Check, Clock3, Ellipsis, Folder, FolderPlus, SquarePen, ChevronDown } from 'lucide-react';
import { DropdownPopup, TooltipAnchor } from '@librechat/client';
import type { MenuItemProps, RenderProp } from '~/common';
import type { SidebarChatSort, SidebarOrganizationMode } from './types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface ChatsHeaderControls {
  organizationMode: SidebarOrganizationMode;
  chatSortBy: SidebarChatSort;
  onOrganizationModeChange: (mode: SidebarOrganizationMode) => void;
  onChatSortByChange: (sortBy: SidebarChatSort) => void;
  onNewProject: () => void;
}

interface ChatsHeaderProps extends ChatsHeaderControls {
  isExpanded: boolean;
  onToggle: () => void;
}

const headerIconButtonClassName =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

const menuIconClassName = 'h-4 w-4 text-text-secondary';

function renderSelectedMenuItem(label: string, icon: ReactNode, isSelected: boolean): RenderProp {
  return function SelectedMenuItem({ className, ...props }) {
    return (
      <div {...props} className={cn(className, 'justify-between gap-5')}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="mr-0 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </span>
        {isSelected ? (
          <Check className="h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
        ) : (
          <span className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </div>
    );
  };
}

function createSelectedMenuItem<T extends string>({
  id,
  value,
  label,
  icon,
  selectedValue,
  onSelect,
}: {
  id: string;
  value: T;
  label: string;
  icon: ReactNode;
  selectedValue: T;
  onSelect: (value: T) => void;
}): MenuItemProps {
  const isSelected = selectedValue === value;
  return {
    id,
    ariaLabel: label,
    ariaChecked: isSelected,
    onClick: () => onSelect(value),
    render: renderSelectedMenuItem(label, icon, isSelected),
  };
}

const ChatsHeader: FC<ChatsHeaderProps> = ({
  isExpanded,
  onToggle,
  organizationMode,
  chatSortBy,
  onOrganizationModeChange,
  onChatSortByChange,
  onNewProject,
}) => {
  const localize = useLocalize();
  const menuId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const dropdownItems = useMemo<MenuItemProps[]>(
    () => [
      {
        id: 'organize-by-project',
        ...createSelectedMenuItem<SidebarOrganizationMode>({
          id: 'organize-by-project',
          value: 'byProject',
          label: localize('com_ui_sidebar_mode_by_project'),
          icon: <Folder className={menuIconClassName} aria-hidden="true" />,
          selectedValue: organizationMode,
          onSelect: onOrganizationModeChange,
        }),
      },
      {
        id: 'organize-recent-projects',
        ...createSelectedMenuItem<SidebarOrganizationMode>({
          id: 'organize-recent-projects',
          value: 'recentProjects',
          label: localize('com_ui_sidebar_mode_recent_projects'),
          icon: <Folder className={menuIconClassName} aria-hidden="true" />,
          selectedValue: organizationMode,
          onSelect: onOrganizationModeChange,
        }),
      },
      {
        id: 'organize-chronological',
        ...createSelectedMenuItem<SidebarOrganizationMode>({
          id: 'organize-chronological',
          value: 'chronological',
          label: localize('com_ui_sidebar_mode_chronological_list'),
          icon: <Clock3 className={menuIconClassName} aria-hidden="true" />,
          selectedValue: organizationMode,
          onSelect: onOrganizationModeChange,
        }),
      },
      { separate: true },
      {
        id: 'sort-created',
        ...createSelectedMenuItem<SidebarChatSort>({
          id: 'sort-created',
          value: 'createdAt',
          label: localize('com_ui_sort_created'),
          icon: <Clock3 className={menuIconClassName} aria-hidden="true" />,
          selectedValue: chatSortBy,
          onSelect: onChatSortByChange,
        }),
      },
      {
        id: 'sort-updated',
        ...createSelectedMenuItem<SidebarChatSort>({
          id: 'sort-updated',
          value: 'updatedAt',
          label: localize('com_ui_sort_updated'),
          icon: <SquarePen className={menuIconClassName} aria-hidden="true" />,
          selectedValue: chatSortBy,
          onSelect: onChatSortByChange,
        }),
      },
    ],
    [chatSortBy, localize, onChatSortByChange, onOrganizationModeChange, organizationMode],
  );

  return (
    <div className="flex h-8 w-full items-center gap-0.5">
      <button
        onClick={onToggle}
        className="group flex min-w-0 flex-1 items-center gap-1 rounded-lg px-1 py-2 text-xs font-bold text-text-secondary outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white"
        type="button"
        aria-expanded={isExpanded}
      >
        <span className="select-none truncate">{localize('com_ui_all_chats')}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 transition-transform duration-200',
            isExpanded ? '' : '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      <DropdownPopup
        portal={true}
        focusLoop={true}
        unmountOnHide={true}
        menuId={menuId}
        isOpen={isMenuOpen}
        setIsOpen={setIsMenuOpen}
        modal={true}
        className="z-[125] min-w-56"
        iconClassName="mr-0 text-text-secondary"
        trigger={
          <TooltipAnchor
            description={localize('com_nav_convo_menu_options')}
            render={
              <Ariakit.MenuButton
                id="chats-header-menu-button"
                aria-label={localize('com_nav_convo_menu_options')}
                className={cn(
                  headerIconButtonClassName,
                  isMenuOpen && 'bg-surface-hover text-text-primary',
                )}
              >
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
              </Ariakit.MenuButton>
            }
          />
        }
        items={dropdownItems}
      />

      <TooltipAnchor
        description={localize('com_ui_new_project')}
        render={
          <button
            type="button"
            aria-label={localize('com_ui_new_project')}
            className={headerIconButtonClassName}
            onClick={onNewProject}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
};

ChatsHeader.displayName = 'ChatsHeader';

export default memo(ChatsHeader);
