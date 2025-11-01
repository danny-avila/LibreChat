import type { AgentOutput, AgentSummary } from '~/data-provider/agent-insights';

interface AgentCardProps {
  output: AgentOutput;
  summary?: AgentSummary;
  onClick: () => void;
}

export default function AgentCard({ output, summary, onClick }: AgentCardProps) {
  const displayName = summary?.display_name || output.agent_name;
  const description = summary?.description || '';
  const preview = output.response.substring(0, 200) + (output.response.length > 200 ? '...' : '');

  // Format timestamp
  const formattedTime = new Date(output.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border-light bg-white p-6 shadow-sm transition-all hover:border-border-medium hover:shadow-md dark:border-border-dark dark:bg-gray-800 dark:hover:border-gray-600"
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-text-primary">{displayName}</h3>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>

      {/* Timestamp */}
      <div className="mb-3 flex items-center text-xs text-text-secondary">
        <svg
          className="mr-1 h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Last updated: {formattedTime}</span>
      </div>

      {/* Preview */}
      <div className="mb-4 rounded-md bg-gray-50 p-4 dark:bg-gray-900">
        <p className="line-clamp-4 text-sm text-text-secondary">{preview}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-light pt-3 dark:border-border-dark">
        <div className="flex items-center space-x-3 text-xs text-text-secondary">
          <span className="rounded-full bg-blue-100 px-2 py-1 dark:bg-blue-900">
            {output.model}
          </span>
          <span>{output.iterations} iterations</span>
        </div>
        <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          View Details →
        </button>
      </div>
    </div>
  );
}
