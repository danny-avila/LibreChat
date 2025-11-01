import { useState, useMemo } from 'react';
import { Spinner } from '@librechat/client';
import { useGetAgentSummaries, useGetLatestAgentOutputs } from '~/data-provider/agent-insights';
import { useLocalize } from '~/hooks';
import AgentCard from './AgentCard';
import AgentDetail from './AgentDetail';
import SearchBar from './SearchBar';
import type { AgentOutput } from '~/data-provider/agent-insights';

export default function AgentInsightsPage() {
  const localize = useLocalize();
  const [selectedAgent, setSelectedAgent] = useState<AgentOutput | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: summaries, isLoading: summariesLoading } = useGetAgentSummaries();
  const { data: latestData, isLoading: latestLoading } = useGetLatestAgentOutputs();

  const latestOutputs = latestData?.agents || [];

  // Filter agents based on search query
  const filteredOutputs = useMemo(() => {
    if (!searchQuery) {
      return latestOutputs;
    }
    const query = searchQuery.toLowerCase();
    return latestOutputs.filter(
      (output) =>
        output.agent_name.toLowerCase().includes(query) ||
        output.response.toLowerCase().includes(query),
    );
  }, [latestOutputs, searchQuery]);

  const isLoading = summariesLoading || latestLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-light bg-surface-primary-alt p-6 dark:border-border-dark dark:bg-surface-primary">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold text-text-primary">Agent Insights</h1>
          <p className="mt-2 text-text-secondary">
            View and explore insights from your Dagster research agents
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="border-b border-border-light bg-surface-primary px-6 py-4 dark:border-border-dark">
        <div className="mx-auto max-w-7xl">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {selectedAgent ? (
          <AgentDetail
            output={selectedAgent}
            onBack={() => setSelectedAgent(null)}
            summaries={summaries || []}
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-7xl p-6">
              {filteredOutputs.length === 0 ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="rounded-lg bg-white p-6 text-lg text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
                    {searchQuery
                      ? localize('com_ui_nothing_found')
                      : 'No agent outputs available'}
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {filteredOutputs.map((output) => {
                    const summary = summaries?.find((s) => s.agent_name === output.agent_name);
                    return (
                      <AgentCard
                        key={`${output.agent_name}-${output.timestamp}`}
                        output={output}
                        summary={summary}
                        onClick={() => setSelectedAgent(output)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
