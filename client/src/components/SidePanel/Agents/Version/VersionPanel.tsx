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

// Extend Agent type to include versions field
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
  selectedAgentId?: string; // Add prop for directly passing an agent ID
};

// Using localization instead of hardcoded text constants

export default function VersionPanel({
  agentsConfig,
  setActivePanel,
  selectedAgentId,
}: VersionPanelProps) {
  const localize = useLocalize();

  // Helper function to get timestamp from version object regardless of field name
  const getVersionTimestamp = (version: Record<string, any>): string => {
    // Try different possible timestamp field names, in order of preference
    const timestamp = version.created_at || version.createdAt || version.updatedAt;

    if (timestamp) {
      try {
        return new Date(timestamp).toLocaleString();
      } catch (error) {
        // Silent error handling for invalid date formats
        return localize('com_ui_agent_version_unknown_date');
      }
    }

    // Fallback if no timestamp field is found
    return localize('com_ui_agent_version_no_date');
  };

  // Get agent_id either from props, URL params, or form context
  // This handles the case where the component might be used outside of a form

  // Try to get the agent_id from URL params first (if we're in a route with an agent_id)
  const { agent_id: urlAgentId } = useParams<{ agent_id: string }>();

  // Then try to get it from form context if available
  const methods = useFormContext<AgentForm>();

  // Get form context agent_id if available
  const formAgentId = methods?.getValues?.('id');

  // Prioritize selectedAgentId prop, then form context, then URL param
  const agent_id = selectedAgentId || formAgentId || urlAgentId || '';

  // Fetch the agent data, including versions
  const {
    data: agent,
    isLoading,
    error,
  } = useGetAgentByIdQuery(agent_id || '', {
    enabled: !!agent_id && agent_id !== '',
  });

  // Get versions from the fetched agent data
  const agentWithVersions = agent as AgentWithVersions;
  const versions = agentWithVersions?.versions || [];

  // We'll continue even if methods or agent_id is not available
  // The UI will handle showing appropriate states

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
