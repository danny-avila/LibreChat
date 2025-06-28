import { ChevronLeft } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useGetAgentByIdQuery, useRevertAgentVersionMutation } from '~/data-provider';
import type { Agent } from 'librechat-data-provider';
import { isActiveVersion } from './isActiveVersion';
import { useAgentPanelContext } from '~/Providers';
import { useLocalize, useToast } from '~/hooks';
import VersionContent from './VersionContent';
import { Panel } from '~/common';

export type VersionRecord = Record<string, any>;

export type AgentState = {
  name: string | null;
  description: string | null;
  instructions: string | null;
  artifacts?: string | null;
  capabilities?: string[];
  tools?: string[];
} | null;

export type VersionWithId = {
  id: number;
  originalIndex: number;
  version: VersionRecord;
  isActive: boolean;
};

export type VersionContext = {
  versions: VersionRecord[];
  versionIds: VersionWithId[];
  currentAgent: AgentState;
  selectedAgentId: string;
  activeVersion: VersionRecord | null;
};

export interface AgentWithVersions extends Agent {
  capabilities?: string[];
  versions?: Array<VersionRecord>;
}

export default function VersionPanel() {
  const localize = useLocalize();
  const { showToast } = useToast();
  const { agent_id, setActivePanel } = useAgentPanelContext();

  const selectedAgentId = agent_id ?? '';

  const {
    data: agent,
    isLoading,
    error,
    refetch,
  } = useGetAgentByIdQuery(selectedAgentId, {
    enabled: !!selectedAgentId && selectedAgentId !== '',
  });

  const revertAgentVersion = useRevertAgentVersionMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_agent_version_restore_success'),
        status: 'success',
      });
      refetch();
    },
    onError: () => {
      showToast({
        message: localize('com_ui_agent_version_restore_error'),
        status: 'error',
      });
    },
  });

  const agentWithVersions = agent as AgentWithVersions;

  const currentAgent = useMemo(() => {
    if (!agentWithVersions) return null;
    return {
      name: agentWithVersions.name,
      description: agentWithVersions.description,
      instructions: agentWithVersions.instructions,
      artifacts: agentWithVersions.artifacts,
      capabilities: agentWithVersions.capabilities,
      tools: agentWithVersions.tools,
    };
  }, [agentWithVersions]);

  const versions = useMemo(() => {
    const versionsCopy = [...(agentWithVersions?.versions || [])];
    return versionsCopy.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [agentWithVersions?.versions]);

  const activeVersion = useMemo(() => {
    return versions.length > 0
      ? versions.find((v) => isActiveVersion(v, currentAgent, versions)) || null
      : null;
  }, [versions, currentAgent]);

  const versionIds = useMemo(() => {
    if (versions.length === 0) return [];

    const matchingVersions = versions.filter((v) => isActiveVersion(v, currentAgent, versions));

    const activeVersionId =
      matchingVersions.length > 0 ? versions.findIndex((v) => v === matchingVersions[0]) : -1;

    return versions.map((version, displayIndex) => {
      const originalIndex =
        agentWithVersions?.versions?.findIndex(
          (v) =>
            v.updatedAt === version.updatedAt &&
            v.createdAt === version.createdAt &&
            v.name === version.name,
        ) ?? displayIndex;

      return {
        id: displayIndex,
        originalIndex,
        version,
        isActive: displayIndex === activeVersionId,
      };
    });
  }, [versions, currentAgent, agentWithVersions?.versions]);

  const versionContext: VersionContext = useMemo(
    () => ({
      versions,
      versionIds,
      currentAgent,
      selectedAgentId,
      activeVersion,
    }),
    [versions, versionIds, currentAgent, selectedAgentId, activeVersion],
  );

  const handleRestore = useCallback(
    (displayIndex: number) => {
      const versionWithId = versionIds.find((v) => v.id === displayIndex);

      if (versionWithId) {
        const originalIndex = versionWithId.originalIndex;

        revertAgentVersion.mutate({
          agent_id: selectedAgentId,
          version_index: originalIndex,
        });
      }
    },
    [revertAgentVersion, selectedAgentId, versionIds],
  );

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[40vh] overflow-auto pb-12 text-sm">
      <div className="version-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-0 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
          >
            <div className="version-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>
        <div className="mb-2 mt-2 text-xl font-medium">
          {localize('com_ui_agent_version_history')}
        </div>
      </div>
      <div className="flex flex-col gap-4 px-2">
        <VersionContent
          selectedAgentId={selectedAgentId}
          isLoading={isLoading}
          error={error}
          versionContext={versionContext}
          onRestore={handleRestore}
        />
      </div>
    </div>
  );
}
