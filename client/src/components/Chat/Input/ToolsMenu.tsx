import React, { memo, useState, useMemo, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import {
  Check,
  Globe,
  Wrench,
  ChevronDown,
  ScrollText,
  WandSparkles,
  TerminalSquareIcon,
} from 'lucide-react';
import { TooltipAnchor, DropdownPopup, VectorIcon } from '@librechat/client';
import {
  Permissions,
  ArtifactModes,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

// V1 UX POP/BETC : recherche web nécessite clés admin (Serper/
// Firecrawl/Jina) posées en yaml DevOps. Cachée tant que conf
// côté serveur non faite. Repasser à true quand DevOps a configuré.
// Couplé avec le même flag dans ActiveToolChips.tsx — flipper les deux
// ensemble.
const SHOW_WEB_SEARCH_TOOL = false;

interface ToolMenuConfig {
  id: string;
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  isActive: boolean;
  onToggle: () => void;
}

function ToolsMenu() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const { skills, webSearch, artifacts, fileSearch, codeInterpreter, agentsConfig } =
    context ?? {};

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
  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });

  const { codeEnabled, webSearchEnabled, artifactsEnabled, fileSearchEnabled, skillsEnabled } =
    useAgentCapabilities(agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const handleFileSearchToggle = useCallback(() => {
    const newValue = !fileSearch?.toggleState;
    fileSearch?.debouncedChange({ value: newValue });
  }, [fileSearch]);

  const handleWebSearchToggle = useCallback(() => {
    const newValue = !webSearch?.toggleState;
    webSearch?.debouncedChange({ value: newValue });
  }, [webSearch]);

  const handleSkillsToggle = useCallback(() => {
    const newValue = !skills?.toggleState;
    skills?.debouncedChange({ value: newValue });
  }, [skills]);

  const handleCodeInterpreterToggle = useCallback(() => {
    const newValue = !codeInterpreter?.toggleState;
    codeInterpreter?.debouncedChange({ value: newValue });
  }, [codeInterpreter]);

  const handleArtifactsToggle = useCallback(() => {
    const current = artifacts?.toggleState;
    if (!current || current === '') {
      artifacts?.debouncedChange({ value: ArtifactModes.DEFAULT });
    } else {
      artifacts?.debouncedChange({ value: '' });
    }
  }, [artifacts]);

  const toolConfigs = useMemo<ToolMenuConfig[]>(() => {
    const items: ToolMenuConfig[] = [];

    if (fileSearchEnabled && canUseFileSearch) {
      items.push({
        id: 'file_search',
        icon: <VectorIcon className="icon-md" />,
        label: localize('com_assistants_file_search'),
        tooltip: localize('com_ui_tooltip_file_search'),
        isActive: !!fileSearch?.toggleState,
        onToggle: handleFileSearchToggle,
      });
    }
    if (SHOW_WEB_SEARCH_TOOL && canUseWebSearch && webSearchEnabled) {
      items.push({
        id: 'web_search',
        icon: <Globe className="icon-md" aria-hidden="true" />,
        label: localize('com_ui_web_search'),
        tooltip: localize('com_ui_tooltip_web_search'),
        isActive: !!webSearch?.toggleState,
        onToggle: handleWebSearchToggle,
      });
    }
    if (canUseSkills && skillsEnabled) {
      items.push({
        id: 'skills',
        icon: <ScrollText className="icon-md" aria-hidden="true" />,
        label: localize('com_ui_skills'),
        tooltip: localize('com_ui_tooltip_skills'),
        isActive: !!skills?.toggleState,
        onToggle: handleSkillsToggle,
      });
    }
    if (canRunCode && codeEnabled) {
      items.push({
        id: 'code_interpreter',
        icon: <TerminalSquareIcon className="icon-md" aria-hidden="true" />,
        label: localize('com_assistants_code_interpreter'),
        tooltip: localize('com_ui_tooltip_code_interpreter'),
        isActive: !!codeInterpreter?.toggleState,
        onToggle: handleCodeInterpreterToggle,
      });
    }
    if (artifactsEnabled) {
      const artifactsActive =
        typeof artifacts?.toggleState === 'string' && artifacts.toggleState !== '';
      items.push({
        id: 'artifacts',
        icon: <WandSparkles className="icon-md" aria-hidden="true" />,
        label: localize('com_ui_artifacts'),
        tooltip: localize('com_ui_tooltip_artifacts'),
        isActive: artifactsActive,
        onToggle: handleArtifactsToggle,
      });
    }

    return items;
  }, [
    localize,
    fileSearchEnabled,
    canUseFileSearch,
    fileSearch?.toggleState,
    handleFileSearchToggle,
    canUseWebSearch,
    webSearchEnabled,
    webSearch?.toggleState,
    handleWebSearchToggle,
    canUseSkills,
    skillsEnabled,
    skills?.toggleState,
    handleSkillsToggle,
    canRunCode,
    codeEnabled,
    codeInterpreter?.toggleState,
    handleCodeInterpreterToggle,
    artifactsEnabled,
    artifacts?.toggleState,
    handleArtifactsToggle,
  ]);

  const dropdownItems = useMemo<MenuItemProps[]>(
    () =>
      toolConfigs.map((tool) => ({
        onClick: tool.onToggle,
        hideOnClick: false,
        render: (renderProps) => (
          <div {...renderProps}>
            <TooltipAnchor description={tool.tooltip} side="right">
              <div className="flex flex-1 items-center gap-2">
                {tool.icon}
                <span>{tool.label}</span>
              </div>
            </TooltipAnchor>
            {tool.isActive && (
              <Check className="size-4 text-text-primary" aria-hidden="true" />
            )}
          </div>
        ),
      })),
    [toolConfigs],
  );

  // D#2 — bouton "Outils" caché complètement si aucun outil dispo
  if (toolConfigs.length === 0) {
    return null;
  }

  const menuTrigger = (
    <TooltipAnchor
      render={
        <Ariakit.MenuButton
          id="tools-menu-button"
          aria-label={localize('com_ui_tools')}
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-full border border-border-light px-3 text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            isPopoverActive && 'bg-surface-hover',
          )}
        >
          <Wrench className="size-4" aria-hidden="true" />
          <span>{localize('com_ui_tools')}</span>
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </Ariakit.MenuButton>
      }
      id="tools-menu-button"
      description={localize('com_ui_tools')}
    />
  );

  return (
    <DropdownPopup
      menuId="tools-menu"
      isOpen={isPopoverActive}
      setIsOpen={setIsPopoverActive}
      modal={true}
      unmountOnHide={true}
      trigger={menuTrigger}
      items={dropdownItems}
      itemClassName="flex w-full cursor-pointer rounded-lg items-center justify-between hover:bg-surface-hover gap-5"
      iconClassName="mr-0"
    />
  );
}

export default memo(ToolsMenu);
