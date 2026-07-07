import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { Label, OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions, AgentCapabilities } from 'librechat-data-provider';
import type { TPlugin } from 'librechat-data-provider';
import type { AgentItem } from './items/types';
import type { AgentForm } from '~/common';
import {
  useAgentItems,
  useResolvedSkills,
  useAgentFileEntries,
  useUninstallToolCredentials,
} from './hooks';
import { computeToggleAction, skillsEnabledTransition } from './items/mutations';
import { useListSkillsQuery, useDeleteAgentAction } from '~/data-provider';
import { useRemoveMCPTool, useVisibleTools } from '~/hooks/MCP';
import ToolsMarketplaceDialog from './ToolsMarketplaceDialog';
import { useLocalize, useHasAccess } from '~/hooks';
import { useAgentPanelContext } from '~/Providers';
import ItemDialog from './ItemDialog/ItemDialog';
import { isEphemeralAgent } from '~/common';
import SkillsDialog from './SkillsDialog';
import ToolRow from './ToolRow';

interface Props {
  agentId: string;
}

export default function ToolsSection({ agentId }: Props) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<AgentItem | null>(null);
  const [pendingActionRemoval, setPendingActionRemoval] = useState<string | null>(null);
  const [pendingMcpRemoval, setPendingMcpRemoval] = useState<string | null>(null);

  const { getValues, setValue } = useFormContext<AgentForm>();
  const { agentsConfig, regularTools, mcpServersMap } = useAgentPanelContext();
  const { removeTool: removeMCPTool } = useRemoveMCPTool();
  const deleteAgentAction = useDeleteAgentAction({
    onSuccess: () => {
      showToast({
        message: localize('com_assistants_delete_actions_success'),
        status: 'success',
      });
    },
    onError: (error) => {
      showToast({
        message: (error as Error).message || localize('com_assistants_delete_actions_error'),
        status: 'error',
      });
    },
  });

  const hasSkillsAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const skillsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.skills) ?? false,
    [agentsConfig],
  );
  const showSkills = hasSkillsAccess && skillsEnabled;
  const { data: skillsData } = useListSkillsQuery({ limit: 100 }, { enabled: showSkills });
  const resolvedSkills = useResolvedSkills(skillsData?.skills);

  const uninstallToolCredentials = useUninstallToolCredentials();
  const { knowledgeFiles, codeFiles } = useAgentFileEntries();

  const { selected, tools } = useAgentItems({
    agentId,
    skills: resolvedSkills,
    skillsPermission: showSkills,
  });

  /** File-backed built-ins stay selected while they hold files, so flipping
   * the capability flag off would leave the row visible. Route their removal
   * to the config dialog (where files are managed) instead, mirroring the
   * file-only `context` built-in. */
  const opensFileManagerOnRemove = useCallback(
    (item: AgentItem): boolean => {
      if (item.kind !== 'builtin') {
        return false;
      }
      if (item.id === 'context') {
        return true;
      }
      if (item.id === 'execute_code') {
        return codeFiles.length > 0;
      }
      if (item.id === 'file_search') {
        return knowledgeFiles.length > 0;
      }
      return false;
    },
    [codeFiles, knowledgeFiles],
  );

  const handleQuickRemove = useCallback(
    (item: AgentItem) => {
      if (opensFileManagerOnRemove(item)) {
        setDialogItem(item);
        return;
      }
      const patch = computeToggleAction(item, { selected: true });
      switch (patch.type) {
        case 'builtin':
          setValue(patch.field as keyof AgentForm, patch.value as never, { shouldDirty: true });
          break;
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
        case 'skill-remove': {
          const current = (getValues('skills') ?? []) as string[];
          const next = current.filter((s) => s !== patch.id);
          setValue('skills', next, { shouldDirty: true });
          const flag = skillsEnabledTransition(current, next, getValues('skills_enabled'));
          if (flag !== undefined) {
            setValue('skills_enabled', flag, { shouldDirty: true });
          }
          break;
        }
        case 'mcp-remove':
          setPendingMcpRemoval(patch.serverName);
          break;
        case 'action-remove':
          setPendingActionRemoval(patch.actionId);
          break;
        default:
          break;
      }
    },
    [getValues, setValue, uninstallToolCredentials, opensFileManagerOnRemove],
  );

  const confirmMcpRemoval = useCallback(() => {
    if (pendingMcpRemoval == null) {
      return;
    }
    removeMCPTool(pendingMcpRemoval);
    setPendingMcpRemoval(null);
  }, [pendingMcpRemoval, removeMCPTool]);

  const confirmActionRemoval = useCallback(() => {
    if (pendingActionRemoval == null) {
      return;
    }
    if (isEphemeralAgent(agentId)) {
      showToast({
        message: localize('com_agents_no_agent_id_error'),
        status: 'error',
      });
      setPendingActionRemoval(null);
      return;
    }
    deleteAgentAction.mutate({ action_id: pendingActionRemoval, agent_id: agentId });
    setPendingActionRemoval(null);
  }, [pendingActionRemoval, agentId, deleteAgentAction, showToast, localize]);

  const { mcpServerNames: attachedMcpServers } = useVisibleTools(
    tools,
    regularTools ?? undefined,
    mcpServersMap ?? new Map(),
  );

  /** MCP servers still referenced by the agent's tools but absent from the available
   * servers map (removed from config, or a legacy server-only token). The catalog is
   * built from available servers, so these would otherwise be invisible and
   * unremovable — surface them as removable "needs setup" rows, mirroring the old
   * UnconfiguredMCPTool. */
  const orphanedMcpItems = useMemo<AgentItem[]>(
    () =>
      attachedMcpServers
        .filter((name) => mcpServersMap?.has(name) !== true)
        .map((name) => ({
          kind: 'mcp',
          id: name,
          name,
          description: '',
          iconKey: 'mcp',
          status: 'needs_setup',
          toolCount: 0,
          server: {
            serverName: name,
            tools: [],
            isConfigured: false,
            isConnected: false,
            metadata: { name, pluginKey: name, description: '' } as TPlugin,
          },
        })),
    [attachedMcpServers, mcpServersMap],
  );

  /** MCP rows show how many of the server's tools are enabled for this agent, not
   * the total the server exposes, so the count reflects what the agent can use. */
  const toolItems = useMemo(() => {
    const enabled = new Set(tools);
    const withCounts = selected
      .filter((item) => item.kind !== 'skill')
      .map((item) =>
        item.kind === 'mcp'
          ? {
              ...item,
              toolCount: (item.server.tools ?? []).filter((t) => enabled.has(t.tool_id)).length,
            }
          : item,
      );
    return [...withCounts, ...orphanedMcpItems];
  }, [selected, orphanedMcpItems, tools]);
  const skillItems = useMemo(() => selected.filter((item) => item.kind === 'skill'), [selected]);

  return (
    <>
      <SelectedSection
        title={localize('com_ui_tools_section_title')}
        addLabel={localize('com_ui_add_tools')}
        emptyLabel={localize('com_ui_tools_empty')}
        emptyHint={localize('com_ui_tools_empty_hint')}
        items={toolItems}
        onAdd={() => setOpen(true)}
        onInfo={setDialogItem}
        onRemove={handleQuickRemove}
      />
      {showSkills && (
        <SelectedSection
          title={localize('com_ui_skills')}
          addLabel={localize('com_ui_add_skills')}
          emptyLabel={localize('com_ui_skills_empty')}
          emptyHint={localize('com_ui_skills_empty_hint')}
          items={skillItems}
          onAdd={() => setSkillsOpen(true)}
          onInfo={setDialogItem}
          onRemove={handleQuickRemove}
        />
      )}
      {open && <ToolsMarketplaceDialog open={open} onOpenChange={setOpen} agentId={agentId} />}
      {skillsOpen && (
        <SkillsDialog open={skillsOpen} onOpenChange={setSkillsOpen} agentId={agentId} />
      )}
      <ItemDialog item={dialogItem} agentId={agentId} onClose={() => setDialogItem(null)} />
      <OGDialog
        open={pendingActionRemoval != null}
        onOpenChange={(value) => {
          if (!value) {
            setPendingActionRemoval(null);
          }
        }}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_action')}
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_delete_action_confirm')}
            </Label>
          }
          selection={{
            selectHandler: confirmActionRemoval,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
      <OGDialog
        open={pendingMcpRemoval != null}
        onOpenChange={(value) => {
          if (!value) {
            setPendingMcpRemoval(null);
          }
        }}
      >
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_ui_delete_tool')}
          className="max-w-[450px]"
          main={
            <Label className="text-left text-sm font-medium">
              {localize('com_ui_delete_tool_confirm')}
            </Label>
          }
          selection={{
            selectHandler: confirmMcpRemoval,
            selectClasses:
              'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 transition-color duration-200 text-white',
            selectText: localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </>
  );
}

interface SelectedSectionProps {
  title: string;
  addLabel: string;
  emptyLabel: string;
  emptyHint: string;
  items: AgentItem[];
  onAdd: () => void;
  onInfo: (item: AgentItem) => void;
  onRemove: (item: AgentItem) => void;
}

function SelectedSection({
  title,
  addLabel,
  emptyLabel,
  emptyHint,
  items,
  onAdd,
  onInfo,
  onRemove,
}: SelectedSectionProps) {
  const localize = useLocalize();
  return (
    <div className="mb-3 flex flex-col">
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          {title}
          {items.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-surface-tertiary px-1.5 text-[10px] font-medium normal-case tracking-normal text-text-secondary">
              {items.length}
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          {localize('com_ui_add')}
        </button>
      </div>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border-light px-2 py-4 text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs">{emptyLabel}</span>
          <span className="text-[11px] text-text-secondary">{emptyHint}</span>
        </button>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <ToolRow item={item} onInfo={onInfo} onRemove={onRemove} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
