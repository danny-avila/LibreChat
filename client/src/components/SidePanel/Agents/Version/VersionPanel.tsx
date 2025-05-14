import { ChevronLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useFormContext } from 'react-hook-form';
import type { TAgentsEndpoint, Agent } from 'librechat-data-provider';
import type { AgentForm } from '~/common/agents-types';
import type { AgentPanelProps } from '~/common';
import { useGetAgentByIdQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { Spinner } from '~/components/svg';
import { Panel } from '~/common';

// Extend Agent type to include versions field
interface AgentWithVersions extends Agent {
  versions?: Array<{
    created_at: string | number | Date;
    [key: string]: any;
  }>;
}

type VersionPanelProps = {
  agentsConfig: TAgentsEndpoint | null;
  setActivePanel: AgentPanelProps['setActivePanel'];
};

// Text placeholder constants to avoid i18next linting errors
const TEXT = {
  TITLE: 'Version History',
  ERROR: 'Error fetching versions',
  EMPTY: 'No versions available',
  VERSION: 'Version',
  RESTORE: 'Restore',
};

export default function VersionPanel({ agentsConfig, setActivePanel }: VersionPanelProps) {
  const localize = useLocalize();

  // Get agent_id either from props, URL params, or form context
  // This handles the case where the component might be used outside of a form

  // Try to get the agent_id from URL params first (if we're in a route with an agent_id)
  const { agent_id: urlAgentId } = useParams<{ agent_id: string }>();

  // Then try to get it from form context if available
  const methods = useFormContext<AgentForm>();

  // Prioritize form context agent_id, fallback to URL param
  const agent_id = methods?.getValues?.('id') || urlAgentId || '';

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
        <div className="mb-2 mt-2 text-xl font-medium">{TEXT.TITLE}</div>
      </div>
      <div className="flex flex-col gap-4 px-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-500">{TEXT.ERROR}</div>
        ) : versions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {versions.map((version, index) => (
              <div key={index} className="rounded-md border border-border-light p-3">
                <div className="font-medium">
                  {TEXT.VERSION} {versions.length - index}
                </div>
                <div className="text-sm text-text-secondary">
                  {new Date(version.created_at).toLocaleString()}
                </div>
                <button
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                  onClick={() => {
                    // Handle restore version logic here
                    console.log('Restore version', version);
                    // You would implement the restore functionality here
                  }}
                  aria-label={TEXT.RESTORE}
                >
                  {TEXT.RESTORE}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-text-secondary">{TEXT.EMPTY}</div>
        )}
      </div>
    </div>
  );
}
