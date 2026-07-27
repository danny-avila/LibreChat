import React, { useMemo, useEffect, useRef, useCallback } from 'react';
import { MCPIcon } from '@librechat/client';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { Brain, Globe, Layers, FolderSearch, WandSparkles, SquareChevronRight } from 'lucide-react';
import {
  Permissions,
  ArtifactModes,
  PermissionTypes,
  isEphemeralAgentId,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { TSkillSummary, TToolFavoriteType } from 'librechat-data-provider';
import {
  useHasAccess,
  useHasMemoryAccess,
  useAgentCapabilities,
  useSkillActiveState,
} from '~/hooks';
import { filterSkillsForPopover } from '~/components/Chat/Input/SkillsCommand';
import { useAgentsMapContext, useBadgeRowContext } from '~/Providers';
import { useSkillsInfiniteQuery } from '~/data-provider';
import store, { ephemeralAgentByConvoId } from '~/store';
import useLocalize from '~/hooks/useLocalize';

export type PaletteSection = 'tool' | 'skill' | 'mcp';

/**
 * One accent per tool, picked so the category reads before the label does:
 * blue for information, green for execution, amber for local files, violet for
 * capabilities, pink for recall, orange for produced output.
 *
 * The execute green is a literal because this project's `green` scale is the
 * brand teal — `text-green-500` would have meant "LibreChat", not "run".
 */
const ACCENT = {
  webSearch: 'text-blue-500',
  runCode: 'text-[#22c55e]',
  fileSearch: 'text-amber-500',
  skills: 'text-purple-500',
  memory: 'text-pink-500',
  artifacts: 'text-orange-500',
} as const;

/**
 * One selectable row in the composer palette. Tools, skills and MCP servers are
 * normalized to the same shape so search, favouriting and rendering each run
 * once over a single list rather than per source.
 */
export interface PaletteMode {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}

export interface PaletteEntry {
  key: string;
  itemType: TToolFavoriteType;
  itemId: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  section: PaletteSection;
  active: boolean;
  onSelect: () => void;
  /** Refinements of this tool, rendered as inline pills on the row while it is
   *  on. Not separately favouritable — they only exist within the parent. */
  modes?: PaletteMode[];
  /** Icon tint, carried over from each tool's original badge so the palette and
   *  the chips stay recognisable instead of collapsing to one accent. */
  accent?: string;
}

/** Accumulates skill pages so client-side search covers the full catalog. */
function useAllSkills(enabled: boolean): TSkillSummary[] {
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useSkillsInfiniteQuery(
    { limit: 50 },
    { enabled },
  );

  /* Sticky circuit breaker: once any page request fails, stop auto-fetching so
     a transient API error does not turn into an unbounded retry loop. */
  const blockedRef = useRef(false);
  useEffect(() => {
    if (isError) {
      blockedRef.current = true;
    }
  }, [isError]);

  useEffect(() => {
    if (blockedRef.current || isError || !enabled) {
      return;
    }
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [enabled, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  return useMemo(() => {
    if (!data?.pages) {
      return [];
    }
    const all: TSkillSummary[] = [];
    for (const page of data.pages) {
      for (const skill of page.skills) {
        all.push(skill);
      }
    }
    return all;
  }, [data?.pages]);
}

export default function usePaletteEntries({
  conversationId,
  agentId,
  enabled = true,
}: {
  conversationId: string;
  agentId?: string | null;
  /** Endpoints without a tool row discard these, so there is nothing to fetch
   *  or build for them. */
  enabled?: boolean;
}): PaletteEntry[] {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const agentsMap = useAgentsMapContext();
  const { isActive } = useSkillActiveState();
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const pendingManualSkills = useRecoilValue(store.pendingManualSkillsByConvoId(conversationId));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(conversationId),
  );

  const {
    codeEnabled,
    memoryEnabled,
    webSearchEnabled,
    artifactsEnabled,
    fileSearchEnabled,
    skillsEnabled,
  } = useAgentCapabilities(context?.agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });
  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const canUseMemory = useHasMemoryAccess();

  const skillsListable = enabled && canUseSkills && skillsEnabled;
  const allSkills = useAllSkills(skillsListable);

  /* Mirrors backend `resolveAgentScopedSkillIds`: ephemeral agents see the full
     catalog; persisted agents gate on `skills_enabled` and fail closed while
     `agentsMap` is hydrating or when the agent is missing from it. */
  const agentSkillIds = useMemo<string[] | null | undefined>(() => {
    if (!agentId || isEphemeralAgentId(agentId)) {
      return undefined;
    }
    if (!agentsMap) {
      return [];
    }
    const agent = agentsMap[agentId];
    if (!agent || agent.skills_enabled !== true) {
      return [];
    }
    return Array.isArray(agent.skills) && agent.skills.length > 0 ? agent.skills : undefined;
  }, [agentId, agentsMap]);

  /* A toggle, like every other row: picking a skill used to be one-way, so the
     only way to undo a mis-click was to find the chip in the tray. */
  const toggleSkill = useCallback(
    (name: string) => {
      if (pendingManualSkills.includes(name)) {
        setPendingManualSkills((prev) => prev.filter((staged) => staged !== name));
        return;
      }
      setEphemeralAgent((agent) =>
        agent?.skills === true ? agent : { ...(agent ?? {}), skills: true },
      );
      setPendingManualSkills((prev) => (prev.includes(name) ? prev : [...prev, name]));
    },
    [pendingManualSkills, setEphemeralAgent, setPendingManualSkills],
  );

  return useMemo(() => {
    const entries: PaletteEntry[] = [];
    if (!context || !enabled) {
      return entries;
    }

    const { webSearch, codeInterpreter, fileSearch, skills, memory, artifacts, mcpServerManager } =
      context;

    const pushTool = (
      itemId: string,
      label: string,
      icon: React.ReactNode,
      accent: string,
      active: boolean,
      onSelect: () => void,
      modes?: PaletteMode[],
    ) => {
      entries.push({
        key: `builtin:${itemId}`,
        itemType: 'builtin',
        itemId,
        label,
        icon,
        accent,
        section: 'tool',
        active,
        onSelect,
        modes,
      });
    };

    if (canUseWebSearch && webSearchEnabled) {
      pushTool(
        'web_search',
        localize('com_ui_web_search'),
        <Globe className="icon-md" aria-hidden="true" />,
        ACCENT.webSearch,
        webSearch.toggleState === true,
        () => webSearch.debouncedChange({ value: !webSearch.toggleState }),
      );
    }

    if (canRunCode && codeEnabled) {
      pushTool(
        'execute_code',
        localize('com_ui_run_code'),
        <SquareChevronRight className="icon-md" aria-hidden="true" />,
        ACCENT.runCode,
        codeInterpreter.toggleState === true,
        () => codeInterpreter.debouncedChange({ value: !codeInterpreter.toggleState }),
      );
    }

    if (canUseFileSearch && fileSearchEnabled) {
      pushTool(
        'file_search',
        localize('com_assistants_file_search'),
        <FolderSearch className="icon-md" aria-hidden="true" />,
        ACCENT.fileSearch,
        fileSearch.toggleState === true,
        () => fileSearch.debouncedChange({ value: !fileSearch.toggleState }),
      );
    }

    if (skillsListable) {
      pushTool(
        'skills',
        localize('com_ui_skills'),
        <WandSparkles className="icon-md" aria-hidden="true" />,
        ACCENT.skills,
        skills.toggleState === true,
        () => skills.debouncedChange({ value: !skills.toggleState }),
      );
    }

    if (canUseMemory && memoryEnabled) {
      pushTool(
        'memory',
        localize('com_ui_memory'),
        <Brain className="icon-md" aria-hidden="true" />,
        ACCENT.memory,
        memory.toggleState === true,
        () => memory.debouncedChange({ value: !memory.toggleState }),
      );
    }

    if (artifactsEnabled) {
      const stored = artifacts.toggleState;
      const mode = stored == null || stored === false ? '' : String(stored);
      const artifactsOn = mode !== '';
      /* Anything on that is not an explicit generation mode counts as Default —
         the toggle has historically also held a bare `true`, which would
         otherwise leave every mode unchecked. */
      const isDefault =
        artifactsOn && mode !== ArtifactModes.SHADCNUI && mode !== ArtifactModes.CUSTOM;
      /* The two generation modes only mean anything once artifacts are on, and
         each toggles back to DEFAULT rather than off — same semantics the old
         `ArtifactsSubMenu` had, as inline pills instead of two long rows. */
      const buildMode = (id: string, label: string, target: string): PaletteMode => ({
        id,
        label,
        active: mode === target,
        onSelect: () =>
          artifacts.debouncedChange({ value: mode === target ? ArtifactModes.DEFAULT : target }),
      });
      pushTool(
        'artifacts',
        localize('com_ui_artifacts'),
        <Layers className="icon-md" aria-hidden="true" />,
        ACCENT.artifacts,
        artifactsOn,
        () => artifacts.debouncedChange({ value: artifactsOn ? '' : ArtifactModes.DEFAULT }),
        artifactsOn
          ? [
              {
                id: 'default',
                label: localize('com_ui_default'),
                active: isDefault,
                onSelect: () => artifacts.debouncedChange({ value: ArtifactModes.DEFAULT }),
              },
              buildMode('shadcn', localize('com_ui_shadcnui'), ArtifactModes.SHADCNUI),
              buildMode('custom', localize('com_ui_custom_prompt'), ArtifactModes.CUSTOM),
            ]
          : undefined,
      );
    }

    if (skillsListable && allSkills.length > 0) {
      const staged = new Set(pendingManualSkills);
      /* Manual skills are primed by name server-side (`resolveManualSkills`),
         so records sharing a name are one selectable thing however many of them
         the catalog holds. Listed once each: otherwise every copy lit up when
         any was picked, while the tray — keyed by name — showed a single chip. */
      const listed = new Set<string>();
      for (const skill of filterSkillsForPopover(allSkills, { agentSkillIds, isActive })) {
        if (listed.has(skill.name)) {
          continue;
        }
        listed.add(skill.name);
        entries.push({
          key: `skill:${skill._id}`,
          itemType: 'skill',
          itemId: skill._id,
          label: skill.displayTitle ?? skill.name,
          description: skill.description,
          icon: <WandSparkles className={`icon-md ${ACCENT.skills}`} aria-hidden="true" />,
          section: 'skill',
          active: staged.has(skill.name),
          onSelect: () => toggleSkill(skill.name),
        });
      }
    }

    const { selectableServers, mcpValues, toggleServerSelection } = mcpServerManager ?? {};
    if (canUseMcp && selectableServers) {
      const selected = new Set(mcpValues ?? []);
      for (const server of selectableServers) {
        const title = server.config?.title || server.serverName;
        entries.push({
          key: `mcp:${server.serverName}`,
          itemType: 'mcp',
          itemId: server.serverName,
          label: title,
          description: server.config?.description,
          /* Servers ship their own branding; fall back to the generic MCP mark
             so a server without `iconPath` still reads as an MCP server rather
             than borrowing an unrelated tool glyph. */
          icon:
            server.config?.iconPath != null && server.config.iconPath !== '' ? (
              <img
                src={server.config.iconPath}
                alt=""
                aria-hidden="true"
                className="h-4 w-4 rounded-sm object-contain"
              />
            ) : (
              <MCPIcon className="h-4 w-4" aria-hidden="true" />
            ),
          section: 'mcp',
          active: selected.has(server.serverName),
          onSelect: () => toggleServerSelection?.(server.serverName),
        });
      }
    }

    return entries;
  }, [
    context,
    enabled,
    localize,
    canUseMcp,
    canRunCode,
    codeEnabled,
    allSkills,
    isActive,
    toggleSkill,
    pendingManualSkills,
    canUseMemory,
    memoryEnabled,
    agentSkillIds,
    skillsListable,
    canUseWebSearch,
    webSearchEnabled,
    artifactsEnabled,
    canUseFileSearch,
    fileSearchEnabled,
  ]);
}
