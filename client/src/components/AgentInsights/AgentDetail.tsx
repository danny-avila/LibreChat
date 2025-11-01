import { useState } from 'react';
import { useGetAgentHistory } from '~/data-provider/agent-insights';
import { Spinner } from '@librechat/client';
import type { AgentOutput, AgentSummary } from '~/data-provider/agent-insights';

interface AgentDetailProps {
  output: AgentOutput;
  onBack: () => void;
  summaries: AgentSummary[];
}

export default function AgentDetail({ output, onBack, summaries }: AgentDetailProps) {
  const [showHistory, setShowHistory] = useState(false);
  const summary = summaries.find((s) => s.agent_name === output.agent_name);
  const displayName = summary?.display_name || output.agent_name;

  const { data: historyData, isLoading: historyLoading } = useGetAgentHistory(
    output.agent_name,
    10,
    {
      enabled: showHistory,
    },
  );

  const formattedTime = new Date(output.timestamp).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-light bg-surface-primary p-6 dark:border-border-dark">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={onBack}
            className="mb-4 flex items-center text-sm text-text-secondary hover:text-text-primary"
          >
            <svg
              className="mr-1 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to all agents
          </button>
          <h1 className="text-3xl font-bold text-text-primary">{displayName}</h1>
          {summary?.description && (
            <p className="mt-2 text-text-secondary">{summary.description}</p>
          )}
          <div className="mt-3 flex items-center space-x-4 text-sm text-text-secondary">
            <span>Last updated: {formattedTime}</span>
            <span className="rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-900">
              {output.model}
            </span>
            <span>{output.iterations} iterations</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          {/* Main Response */}
          <div className="mb-6 rounded-lg border border-border-light bg-white p-6 dark:border-border-dark dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-semibold text-text-primary">Agent Response</h2>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap text-text-secondary">{output.response}</pre>
            </div>
          </div>

          {/* Tool Calls */}
          {output.tool_calls && output.tool_calls.length > 0 && (
            <div className="mb-6 rounded-lg border border-border-light bg-white p-6 dark:border-border-dark dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-semibold text-text-primary">
                Tool Calls ({output.tool_calls.length})
              </h2>
              <div className="space-y-3">
                {output.tool_calls.map((tool, idx) => (
                  <details
                    key={idx}
                    className="rounded border border-border-light bg-gray-50 p-3 dark:border-border-dark dark:bg-gray-900"
                  >
                    <summary className="cursor-pointer font-medium text-text-primary">
                      Tool Call {idx + 1}
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-xs text-text-secondary">
                      {JSON.stringify(tool, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Usage Stats */}
          {output.usage && (
            <div className="mb-6 rounded-lg border border-border-light bg-white p-6 dark:border-border-dark dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-semibold text-text-primary">Usage Statistics</h2>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(output.usage).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded bg-gray-50 p-3 text-center dark:bg-gray-900"
                  >
                    <div className="text-2xl font-bold text-text-primary">{value}</div>
                    <div className="text-xs text-text-secondary">
                      {key.replace(/_/g, ' ').toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History Section */}
          <div className="rounded-lg border border-border-light bg-white p-6 dark:border-border-dark dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-text-primary">Historical Runs</h2>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                {showHistory ? 'Hide History' : 'Load History'}
              </button>
            </div>

            {showHistory && (
              <>
                {historyLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner className="text-text-primary" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyData?.outputs.map((historicalOutput, idx) => {
                      const histTime = new Date(historicalOutput.timestamp).toLocaleString();
                      return (
                        <details
                          key={idx}
                          className="rounded border border-border-light bg-gray-50 p-3 dark:border-border-dark dark:bg-gray-900"
                        >
                          <summary className="cursor-pointer font-medium text-text-primary">
                            {histTime}
                          </summary>
                          <div className="mt-2 text-sm text-text-secondary">
                            <pre className="whitespace-pre-wrap">
                              {historicalOutput.response.substring(0, 500)}
                              {historicalOutput.response.length > 500 ? '...' : ''}
                            </pre>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
