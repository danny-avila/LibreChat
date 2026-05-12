import React, { memo } from 'react';
import { Globe, TerminalSquareIcon, ScrollText, WandSparkles } from 'lucide-react';
import { VectorIcon } from '@librechat/client';
import {
  Permissions,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import { useLocalize, useHasAccess, useAgentCapabilities } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';
import ActiveToolChip from './ActiveToolChip';

// V1 UX POP/BETC : recherche web cachée tant que clés admin non posées
// côté yaml DevOps. Couplé avec le même flag dans ToolsMenu.tsx — flipper
// les deux ensemble.
const SHOW_WEB_SEARCH_TOOL = false;

function ActiveToolChips() {
  const localize = useLocalize();
  const context = useBadgeRowContext();
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

  if (!context) {
    return null;
  }

  const showWebSearch =
    SHOW_WEB_SEARCH_TOOL &&
    canUseWebSearch &&
    webSearchEnabled &&
    webSearch?.toggleState &&
    webSearch?.authData?.authenticated;

  const showCode = canRunCode && codeEnabled && codeInterpreter?.toggleState;

  const showFileSearch =
    canUseFileSearch && fileSearchEnabled && fileSearch?.toggleState;

  const showSkills = canUseSkills && skillsEnabled && skills?.toggleState;

  const artifactsActive =
    typeof artifacts?.toggleState === 'string' && artifacts.toggleState !== '';
  const showArtifacts = artifactsEnabled && artifactsActive;

  return (
    <>
      {showWebSearch && (
        <ActiveToolChip
          icon={<Globe className="size-4" aria-hidden="true" />}
          label={localize('com_ui_search')}
          colorClass="border-blue-600/40 bg-blue-500/10 hover:bg-blue-700/10"
          onDismiss={() => webSearch?.debouncedChange({ value: false })}
        />
      )}
      {showCode && (
        <ActiveToolChip
          icon={<TerminalSquareIcon className="size-4" aria-hidden="true" />}
          label={localize('com_assistants_code_interpreter')}
          colorClass="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
          onDismiss={() => codeInterpreter?.debouncedChange({ value: false })}
        />
      )}
      {showFileSearch && (
        <ActiveToolChip
          icon={<VectorIcon className="size-4" />}
          label={localize('com_assistants_file_search')}
          colorClass="border-green-600/40 bg-green-500/10 hover:bg-green-700/10"
          onDismiss={() => fileSearch?.debouncedChange({ value: false })}
        />
      )}
      {showSkills && (
        <ActiveToolChip
          icon={<ScrollText className="size-4" aria-hidden="true" />}
          label={localize('com_ui_skills')}
          colorClass="border-cyan-600/40 bg-cyan-500/10 hover:bg-cyan-700/10"
          onDismiss={() => skills?.debouncedChange({ value: false })}
        />
      )}
      {showArtifacts && (
        <ActiveToolChip
          icon={<WandSparkles className="size-4" aria-hidden="true" />}
          label={localize('com_ui_artifacts')}
          colorClass="border-amber-600/40 bg-amber-500/10 hover:bg-amber-700/10"
          onDismiss={() => artifacts?.debouncedChange({ value: '' })}
        />
      )}
    </>
  );
}

export default memo(ActiveToolChips);
