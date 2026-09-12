import { useState, useMemo } from 'react';
import * as Ariakit from '@ariakit/react/menu';
import { Button, DropdownPopup } from '@librechat/client';
import { Permissions, PermissionTypes, AgentCapabilities } from 'librechat-data-provider';
import { LayoutGrid, ListFilter, Wrench, Server, Workflow, Star, User, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgentItemKind, ItemFilter } from './items/types';
import { useLocalize, useHasAccess } from '~/hooks';
import { useAgentPanelContext } from '~/Providers';
import { cn } from '~/utils';

type View = NonNullable<ItemFilter['view']>;
type Kind = AgentItemKind | 'all';

interface MarketplaceSidebarProps {
  activeView: View;
  activeKind: Kind;
  onSelectView: (view: View) => void;
  onSelectKind: (kind: Kind) => void;
  counts: Record<AgentItemKind, number>;
  totalCount: number;
  onCreateNew?: (kind: 'mcp' | 'action') => void;
}

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

function SidebarItem({ icon, label, active, onClick, count }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        active
          ? 'bg-surface-active font-medium text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[11px] tabular-nums text-text-secondary">{count}</span>
      )}
    </button>
  );
}

export default function MarketplaceSidebar({
  activeView,
  activeKind,
  onSelectView,
  onSelectKind,
  counts,
  totalCount,
  onCreateNew,
}: MarketplaceSidebarProps) {
  const localize = useLocalize();
  const [createOpen, setCreateOpen] = useState(false);
  const { agentsConfig } = useAgentPanelContext();
  const hasMcpCreateAccess = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CREATE,
  });
  const actionsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.actions) ?? false,
    [agentsConfig],
  );

  const createItems = useMemo(() => {
    const items: Array<{ label: string; icon: ReactNode; onClick: () => void }> = [];
    if (hasMcpCreateAccess) {
      items.push({
        label: localize('com_ui_tools_kind_mcp'),
        icon: <Server className="size-4" aria-hidden="true" />,
        onClick: () => onCreateNew?.('mcp'),
      });
    }
    if (actionsEnabled) {
      items.push({
        label: localize('com_ui_tools_kind_actions'),
        icon: <Workflow className="size-4" aria-hidden="true" />,
        onClick: () => onCreateNew?.('action'),
      });
    }
    return items;
  }, [localize, onCreateNew, hasMcpCreateAccess, actionsEnabled]);

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-0.5 border-r border-border-light bg-surface-primary-alt p-3">
      <h2 className="px-2.5 pb-1 pt-1 text-base font-bold text-text-primary">
        {localize('com_ui_tools_marketplace')}
      </h2>

      {createItems.length > 0 && (
        <DropdownPopup
          portal={true}
          mountByState={true}
          unmountOnHide={true}
          isOpen={createOpen}
          setIsOpen={setCreateOpen}
          menuId="marketplace-create-new"
          className="pointer-events-auto"
          trigger={
            <Ariakit.MenuButton
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-2 mt-1 w-full justify-center gap-1.5"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="truncate">{localize('com_ui_tools_create_new')}</span>
                </Button>
              }
            />
          }
          items={createItems}
        />
      )}

      <SidebarItem
        icon={<LayoutGrid className="size-4" />}
        label={localize('com_ui_all_proper')}
        active={activeKind === 'all' && activeView === 'marketplace'}
        onClick={() => {
          onSelectView('marketplace');
          onSelectKind('all');
        }}
        count={totalCount}
      />
      <SidebarItem
        icon={<ListFilter className="size-4" />}
        label={localize('com_ui_tools_kind_official')}
        active={activeKind === 'builtin' && activeView === 'marketplace'}
        onClick={() => {
          onSelectView('marketplace');
          onSelectKind('builtin');
        }}
        count={counts.builtin}
      />
      <SidebarItem
        icon={<Wrench className="size-4" />}
        label={localize('com_ui_tools_kind_tools')}
        active={activeKind === 'tool' && activeView === 'marketplace'}
        onClick={() => {
          onSelectView('marketplace');
          onSelectKind('tool');
        }}
        count={counts.tool}
      />
      <SidebarItem
        icon={<Server className="size-4" />}
        label={localize('com_ui_tools_kind_mcp')}
        active={activeKind === 'mcp' && activeView === 'marketplace'}
        onClick={() => {
          onSelectView('marketplace');
          onSelectKind('mcp');
        }}
        count={counts.mcp}
      />
      <SidebarItem
        icon={<Workflow className="size-4" />}
        label={localize('com_ui_tools_kind_actions')}
        active={activeKind === 'action' && activeView === 'marketplace'}
        onClick={() => {
          onSelectView('marketplace');
          onSelectKind('action');
        }}
        count={counts.action}
      />

      <div className="mx-2 my-3 h-px bg-border-light" />

      <SidebarItem
        icon={<User className="size-4" />}
        label={localize('com_ui_tools_view_made_by_you')}
        active={activeView === 'mine'}
        onClick={() => {
          onSelectView('mine');
          onSelectKind('all');
        }}
      />
      <SidebarItem
        icon={<Star className="size-4" />}
        label={localize('com_ui_tools_view_favorites')}
        active={activeView === 'favorites'}
        onClick={() => {
          onSelectView('favorites');
          onSelectKind('all');
        }}
      />
    </aside>
  );
}
