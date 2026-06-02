import { memo, type FC, type ReactNode } from 'react';
import {
  Check,
  Clock3,
  Ellipsis,
  Folder,
  FolderPlus,
  SquarePen,
  ChevronDown,
} from 'lucide-react';
import {
  TooltipAnchor,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@librechat/client';
import type { SidebarChatSort, SidebarOrganizationMode } from './types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export interface ChatsHeaderControls {
  organizationMode: SidebarOrganizationMode;
  chatSortBy: SidebarChatSort;
  onOrganizationModeChange: (mode: SidebarOrganizationMode) => void;
  onChatSortByChange: (sortBy: SidebarChatSort) => void;
  onNewProject: () => void;
  onNewChat: () => void;
}

interface ChatsHeaderProps extends ChatsHeaderControls {
  isExpanded: boolean;
  onToggle: () => void;
}

const headerIconButtonClassName =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary outline-none transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black dark:focus-visible:ring-white';

const menuIconClassName = 'h-4 w-4 text-text-secondary';

const SelectionMark = memo(({ isSelected }: { isSelected: boolean }) => {
  if (!isSelected) {
    return <span className="ml-auto h-4 w-4" aria-hidden="true" />;
  }
  return <Check className="ml-auto h-4 w-4 text-text-primary" aria-hidden="true" />;
});

SelectionMark.displayName = 'ChatsHeaderSelectionMark';

const ChatsHeader: FC<ChatsHeaderProps> = ({
  isExpanded,
  onToggle,
  organizationMode,
  chatSortBy,
  onOrganizationModeChange,
  onChatSortByChange,
  onNewProject,
  onNewChat,
}) => {
  const localize = useLocalize();

  const organizationItems: Array<{
    value: SidebarOrganizationMode;
    label: string;
    icon: ReactNode;
  }> = [
    {
      value: 'byProject',
      label: localize('com_ui_sidebar_mode_by_project'),
      icon: <Folder className={menuIconClassName} aria-hidden="true" />,
    },
    {
      value: 'recentProjects',
      label: localize('com_ui_sidebar_mode_recent_projects'),
      icon: <Folder className={menuIconClassName} aria-hidden="true" />,
    },
    {
      value: 'chronological',
      label: localize('com_ui_sidebar_mode_chronological_list'),
      icon: <Clock3 className={menuIconClassName} aria-hidden="true" />,
    },
  ];

  const sortItems: Array<{
    value: SidebarChatSort;
    label: string;
    icon: ReactNode;
  }> = [
    {
      value: 'createdAt',
      label: localize('com_ui_sort_created'),
      icon: <Clock3 className={menuIconClassName} aria-hidden="true" />,
    },
    {
      value: 'updatedAt',
      label: localize('com_ui_sort_updated'),
      icon: <SquarePen className={menuIconClassName} aria-hidden="true" />,
    },
  ];

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={localize('com_nav_convo_menu_options')}
            title={localize('com_nav_convo_menu_options')}
            className={headerIconButtonClassName}
          >
            <Ellipsis className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder className={menuIconClassName} aria-hidden="true" />
              <span>{localize('com_ui_sidebar_organization_label')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              {organizationItems.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  role="menuitemradio"
                  aria-checked={organizationMode === item.value}
                  onSelect={() => onOrganizationModeChange(item.value)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  <SelectionMark isSelected={organizationMode === item.value} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Clock3 className={menuIconClassName} aria-hidden="true" />
              <span>{localize('com_ui_sort_by')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {sortItems.map((item) => (
                <DropdownMenuItem
                  key={item.value}
                  role="menuitemradio"
                  aria-checked={chatSortBy === item.value}
                  onSelect={() => onChatSortByChange(item.value)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  <SelectionMark isSelected={chatSortBy === item.value} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

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
      <TooltipAnchor
        description={localize('com_ui_new_chat')}
        render={
          <button
            type="button"
            aria-label={localize('com_ui_new_chat')}
            className={headerIconButtonClassName}
            onClick={onNewChat}
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
};

ChatsHeader.displayName = 'ChatsHeader';

export default memo(ChatsHeader);
