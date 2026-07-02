import { useState, useMemo, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import {
  Input,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import type { AgentItem, AgentItemKind, ItemFilter } from './items/types';
import type { AgentForm } from '~/common';
import { useAgentItems, useUninstallToolCredentials } from './hooks';
import AddMcpServerDialog from './ItemDialog/AddMcpServerDialog';
import { itemKey, mcpServerToken } from './items/selectors';
import { computeToggleAction } from './items/mutations';
import { useGetFavoritesQuery } from '~/data-provider';
import MarketplaceSidebar from './MarketplaceSidebar';
import MarketplaceCatalog from './MarketplaceCatalog';
import ItemDialog from './ItemDialog/ItemDialog';
import { applyFilter } from './items/filtering';
import { NEW_ACTION_ID } from './items/types';
import { useLocalize } from '~/hooks';

interface ToolsMarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
}

type View = NonNullable<ItemFilter['view']>;
type Kind = AgentItemKind | 'all';

export default function ToolsMarketplaceDialog({
  open,
  onOpenChange,
  agentId,
}: ToolsMarketplaceDialogProps) {
  const localize = useLocalize();
  const { getValues, setValue } = useFormContext<AgentForm>();
  const uninstallToolCredentials = useUninstallToolCredentials();

  /** Skills are excluded here — they have their own picker (`SkillsDialog`). */
  const { catalog, selected: selectedItems } = useAgentItems({ agentId });

  const { data: favorites } = useGetFavoritesQuery();

  /** Phase 2 (favorites backend): the favorites API only stores agent favorites
   * today, so nothing here ever matches a catalog item id and the sidebar's
   * "Favorites" view stays empty — same for "Made by you", which only skills
   * populate (and this dialog excludes skills). Both views are kept visible as
   * scaffolding until tool favoriting/ownership lands server-side. */
  const favoritedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const favorite of favorites ?? []) {
      if (favorite.agentId != null) ids.add(favorite.agentId);
      if (favorite.spec != null) ids.add(favorite.spec);
    }
    return ids;
  }, [favorites]);

  const [view, setView] = useState<View>('marketplace');
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState<AgentItem | null>(null);
  const [addMcpOpen, setAddMcpOpen] = useState(false);

  const handleCreateNew = useCallback(
    (createKind: 'mcp' | 'action') => {
      if (createKind === 'mcp') {
        setAddMcpOpen(true);
        return;
      }
      setDetailItem({
        kind: 'action',
        id: NEW_ACTION_ID,
        name: localize('com_ui_new_action'),
        description: '',
        iconKey: 'action',
        endpointCount: 0,
      });
    },
    [localize],
  );

  const selectedIds = useMemo(() => new Set(selectedItems.map(itemKey)), [selectedItems]);

  const counts = useMemo(
    () => ({
      builtin: catalog.filter((i) => i.kind === 'builtin').length,
      tool: catalog.filter((i) => i.kind === 'tool').length,
      mcp: catalog.filter((i) => i.kind === 'mcp').length,
      skill: 0,
      action: catalog.filter((i) => i.kind === 'action').length,
    }),
    [catalog],
  );

  const filtered = useMemo(
    () => applyFilter(catalog, { search, kind, category: 'all', view }, { favoritedIds }),
    [catalog, search, kind, view, favoritedIds],
  );

  const handleToggle = useCallback(
    (item: AgentItem) => {
      const patch = computeToggleAction(item, { selected: selectedIds.has(itemKey(item)) });
      switch (patch.type) {
        case 'builtin':
          setValue(patch.field as keyof AgentForm, patch.value as never, { shouldDirty: true });
          break;
        case 'tool-add': {
          const current = (getValues('tools') ?? []) as string[];
          setValue('tools', Array.from(new Set([...current, patch.id])), { shouldDirty: true });
          break;
        }
        case 'tool-remove': {
          const current = (getValues('tools') ?? []) as string[];
          setValue(
            'tools',
            current.filter((t) => t !== patch.id),
            { shouldDirty: true },
          );
          uninstallToolCredentials(patch.id);
          break;
        }
        case 'mcp-add': {
          if (item.kind !== 'mcp') break;
          const toolIds = (item.server.tools ?? []).map((t) => t.tool_id);
          const current = (getValues('tools') ?? []) as string[];
          setValue(
            'tools',
            Array.from(new Set([...current, mcpServerToken(item.id), ...toolIds])),
            { shouldDirty: true },
          );
          break;
        }
        case 'mcp-remove': {
          if (item.kind !== 'mcp') break;
          const toolIds = new Set((item.server.tools ?? []).map((t) => t.tool_id));
          const serverToken = mcpServerToken(item.id);
          const current = (getValues('tools') ?? []) as string[];
          setValue(
            'tools',
            current.filter((t) => t !== serverToken && !toolIds.has(t)),
            { shouldDirty: true },
          );
          break;
        }
        default:
          break;
      }
    },
    [getValues, setValue, selectedIds, uninstallToolCredentials],
  );

  const handleCardClick = useCallback(
    (item: AgentItem) => {
      /** Actions have no simple enable toggle — clicking always opens the editor. */
      if (item.kind === 'action') {
        setDetailItem(item);
        return;
      }
      if (item.kind === 'builtin' && item.id === 'context') {
        setDetailItem(item);
        return;
      }
      /** An MCP server with no exposed tools yet can't be enabled in place — open
       * its dialog so it can be connected/configured first. */
      if (item.kind === 'mcp' && item.toolCount === 0) {
        setDetailItem(item);
        return;
      }
      const wasSelected = selectedIds.has(itemKey(item));
      if (!wasSelected && item.status === 'needs_setup') {
        setDetailItem(item);
        return;
      }
      handleToggle(item);
    },
    [handleToggle, selectedIds],
  );

  const handleConfigure = useCallback((item: AgentItem) => {
    setDetailItem(item);
  }, []);

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-[1200px] overflow-hidden rounded-2xl border-border-medium p-0 shadow-xl md:max-h-[92vh]">
        <OGDialogTitle className="sr-only">{localize('com_ui_tools_marketplace')}</OGDialogTitle>
        <OGDialogDescription className="sr-only">
          {localize('com_ui_tools_marketplace_description')}
        </OGDialogDescription>
        <div className="flex h-[88vh] max-h-[840px]">
          <MarketplaceSidebar
            activeView={view}
            activeKind={kind}
            onSelectView={setView}
            onSelectKind={setKind}
            counts={counts}
            totalCount={catalog.length}
            onCreateNew={handleCreateNew}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-6 py-4 pr-12">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-text-tertiary"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={localize('com_ui_tools_marketplace_search')}
                  aria-label={localize('com_ui_tools_marketplace_search')}
                  className="bg-transparent pl-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <MarketplaceCatalog
                items={filtered}
                selectedIds={selectedIds}
                onToggle={handleCardClick}
                onConfigure={handleConfigure}
                view={view}
              />
            </div>
          </div>
        </div>
        <ItemDialog item={detailItem} agentId={agentId} onClose={() => setDetailItem(null)} />
        <AddMcpServerDialog open={addMcpOpen} onOpenChange={setAddMcpOpen} />
      </OGDialogContent>
    </OGDialog>
  );
}
