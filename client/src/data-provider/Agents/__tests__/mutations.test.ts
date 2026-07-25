import { createElement } from 'react';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Agent, GraphEdge } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useDeleteAgentMutation } from '../mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      deleteAgent: jest.fn(),
    },
  };
});

const createAgent = (id: string, edges: GraphEdge[] = []): Agent => ({
  id,
  name: id,
  description: null,
  created_at: 0,
  avatar: null,
  provider: 'openAI',
  model: 'test-model',
  model_parameters: {
    temperature: null,
    maxContextTokens: null,
    max_context_tokens: null,
    max_output_tokens: null,
    top_p: null,
    frequency_penalty: null,
    presence_penalty: null,
  },
  edges,
});

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };

describe('useDeleteAgentMutation', () => {
  it('refreshes only expanded agent caches with edges that reference the deleted agent', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const targetId = 'agent_target';
    const affectedId = 'agent_affected';
    const affectedSourceId = 'agent_affected_source';
    const unrelatedId = 'agent_unrelated';
    const affectedQueryKey = [QueryKeys.agent, affectedId, 'expanded'];
    const affectedSourceQueryKey = [QueryKeys.agent, affectedSourceId, 'expanded'];
    const unrelatedQueryKey = [QueryKeys.agent, unrelatedId, 'expanded'];
    const staleAffectedAgent = createAgent(affectedId, [
      { from: affectedId, to: targetId, edgeType: 'handoff' },
    ]);
    const refreshedAffectedAgent = createAgent(affectedId);
    const staleAffectedSourceAgent = createAgent(affectedSourceId, [
      {
        from: [targetId, 'agent_surviving_source'],
        to: affectedSourceId,
        edgeType: 'handoff',
      },
    ]);
    const refreshedAffectedSourceAgent = createAgent(affectedSourceId, [
      { from: 'agent_surviving_source', to: affectedSourceId, edgeType: 'handoff' },
    ]);
    const unrelatedAgent = createAgent(unrelatedId, [
      { from: unrelatedId, to: 'agent_other', edgeType: 'handoff' },
    ]);
    const affectedFetch = jest
      .fn<Promise<Agent>, []>()
      .mockResolvedValueOnce(staleAffectedAgent)
      .mockResolvedValue(refreshedAffectedAgent);
    const affectedSourceFetch = jest
      .fn<Promise<Agent>, []>()
      .mockResolvedValueOnce(staleAffectedSourceAgent)
      .mockResolvedValue(refreshedAffectedSourceAgent);
    const unrelatedFetch = jest.fn<Promise<Agent>, []>().mockResolvedValue(unrelatedAgent);

    await queryClient.prefetchQuery(affectedQueryKey, affectedFetch);
    await queryClient.prefetchQuery(affectedSourceQueryKey, affectedSourceFetch);
    await queryClient.prefetchQuery(unrelatedQueryKey, unrelatedFetch);
    queryClient.setQueryData([QueryKeys.agent, targetId], createAgent(targetId));
    queryClient.setQueryData([QueryKeys.agent, targetId, 'expanded'], createAgent(targetId));

    jest.mocked(dataService.deleteAgent).mockResolvedValue();
    const { result } = renderHook(() => useDeleteAgentMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ agent_id: targetId });
    });

    await waitFor(() => expect(affectedFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(affectedSourceFetch).toHaveBeenCalledTimes(2));

    expect(queryClient.getQueryData(affectedQueryKey)).toEqual(refreshedAffectedAgent);
    expect(queryClient.getQueryData(affectedSourceQueryKey)).toEqual(refreshedAffectedSourceAgent);
    expect(unrelatedFetch).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(unrelatedQueryKey)).toEqual(unrelatedAgent);
    expect(queryClient.getQueryData([QueryKeys.agent, targetId])).toBeUndefined();
    expect(queryClient.getQueryData([QueryKeys.agent, targetId, 'expanded'])).toBeUndefined();
  });
});
