import type { Agent, TAgentsEndpoint } from 'librechat-data-provider';
import { ChevronLeft } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import type { AgentPanelProps } from '~/common';
import { Panel } from '~/common';
import type { AgentForm } from '~/common/agents-types';
import { Spinner } from '~/components/svg';
import { useGetAgentByIdQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface AgentWithVersions extends Agent {
  versions?: Array<{
    created_at?: string | number | Date;
    createdAt?: string | number | Date;
    updatedAt?: string | number | Date;
    [key: string]: any;
  }>;
}

type VersionPanelProps = {
  agentsConfig: TAgentsEndpoint | null;
  setActivePanel: AgentPanelProps['setActivePanel'];
  selectedAgentId?: string;
};

export default function VersionPanel({ setActivePanel, selectedAgentId }: VersionPanelProps) {
  const localize = useLocalize();
  const { agent_id: urlAgentId } = useParams<{ agent_id: string }>();
  const methods = useFormContext<AgentForm>();

  const formAgentId = methods?.getValues?.('id');
  const agent_id = selectedAgentId || formAgentId || urlAgentId || '';
  const {
    data: agent,
    isLoading,
    error,
  } = useGetAgentByIdQuery(agent_id || '', {
    enabled: !!agent_id && agent_id !== '',
  });

  const agentWithVersions = agent as AgentWithVersions;
  const versions = agentWithVersions?.versions || [];

  const getVersionTimestamp = (version: Record<string, any>): string => {
    const timestamp = version.created_at || version.createdAt || version.updatedAt;

    if (timestamp) {
      try {
        return new Date(timestamp).toLocaleString();
      } catch (error) {
        return localize('com_ui_agent_version_unknown_date');
      }
    }

    return localize('com_ui_agent_version_no_date');
  };

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
        {!agent_id ? (
          <div className="py-8 text-center text-text-secondary">
            {localize('com_ui_agent_version_no_agent')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">
            {localize('com_ui_agent_version_error')}
          </div>
        ) : versions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {versions.map((version, index) => (
              <div key={index} className="rounded-md border border-border-light p-3">
                <div className="font-medium">
                  {localize('com_ui_agent_version_title')} {versions.length - index}
                </div>
                <div className="text-sm text-text-secondary">{getVersionTimestamp(version)}</div>
                <button
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                  onClick={() => {
                    // Handle restore version logic here
                    // TODO: Implement restore functionality
                  }}
                  aria-label={localize('com_ui_agent_version_restore')}
                >
                  {localize('com_ui_agent_version_restore')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-text-secondary">
            {localize('com_ui_agent_version_empty')}
          </div>
        )}
      </div>
    </div>
  );
}
