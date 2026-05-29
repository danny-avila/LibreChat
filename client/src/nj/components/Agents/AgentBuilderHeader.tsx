/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import React from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import AgentSelect from '~/components/SidePanel/Agents/AgentSelect';
import ManageAgentDropdown from '~/nj/components/Agents/ManageAgentDropdown';
import type { QueryObserverResult, UseMutationResult } from '@tanstack/react-query';
import type { Agent, AgentCreateParams } from 'librechat-data-provider';
import { useNavigate } from 'react-router-dom';
import { useLocalize, useShowMarketplace } from '~/hooks';

export default function AgentBuilderHeader({
  agent_id,
  onClickCreateNew,
  agentQuery,
  setCurrentAgentId,
  createMutation,
}: {
  agent_id?: string;
  onClickCreateNew: () => void;
  agentQuery: QueryObserverResult<Agent>;
  setCurrentAgentId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Agent, Error, AgentCreateParams>;
}) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const showAgentMarketplace = useShowMarketplace();

  return (
    <div className="flex w-full flex-wrap gap-2 bg-surface-tertiary-alt">
      <div className="mb-1 w-full">
        <div className="flex w-full flex-row items-center justify-between bg-surface-primary-alt px-3 pb-4 pt-4">
          <h2 className="py-1 text-xl font-bold">Agent Builder</h2>

          {/* "Create new" button, shown only when editing an existing agent */}
          {agent_id && (
            <button
              className="btn btn-secondary !px-3 !py-1.5"
              type="button"
              onClick={onClickCreateNew}
            >
              <Plus className="mr-2" aria-hidden="true" size={20} />
              <span className="font-semibold">Create new</span>
            </button>
          )}
        </div>

        <hr className="mb-4 border-border-medium" />
        <span className="mx-3 text-sm font-semibold">Select an agent to edit</span>
      </div>

      {/* Select agent to edit */}
      <div className="mx-3 w-full">
        <AgentSelect
          createMutation={createMutation}
          agentQuery={agentQuery}
          setCurrentAgentId={setCurrentAgentId}
          selectedAgentId={agentQuery.isInitialLoading ? null : (agent_id ?? null)}
        />
      </div>

      {/* Show agent library & manage agent dropdown */}
      {showAgentMarketplace && (
        <div className="mx-3 mt-1 flex w-full flex-row items-center justify-between">
          <button
            type="button"
            className="rounded px-2 py-2 hover:bg-surface-active-alt"
            onClick={() => navigate('/agents')}
          >
            <div className="flex flex-1 items-center truncate">
              <LayoutGrid className="mr-2 h-5 w-5 text-text-primary" aria-hidden="true" />
              <span className="truncate text-sm font-semibold">
                {localize('com_agents_marketplace')}
              </span>
            </div>
          </button>

          {/* NJ: We moved duplicate / delete to the top of the agent builder */}
          {agent_id && (
            <ManageAgentDropdown
              agent={agentQuery.data}
              createMutation={createMutation}
              setCurrentAgentId={setCurrentAgentId}
            />
          )}
        </div>
      )}

      <hr className="mt-1 w-full border-border-heavy" />
    </div>
  );
}
