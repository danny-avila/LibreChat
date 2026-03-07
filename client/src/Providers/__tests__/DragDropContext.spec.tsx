import React from 'react';
import { renderHook } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointsConfig, Agent } from 'librechat-data-provider';
import { DragDropProvider, useDragDropContext } from '../DragDropContext';

const mockEndpointsConfig: TEndpointsConfig = {
  [EModelEndpoint.openAI]: { userProvide: false, order: 0 },
  [EModelEndpoint.agents]: { userProvide: false, order: 1 },
  [EModelEndpoint.anthropic]: { userProvide: false, order: 6 },
  Moonshot: { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
  'Some Endpoint': { type: EModelEndpoint.custom, userProvide: false, order: 9999 },
};

let mockConversation: Record<string, unknown> | null = null;
let mockAgentsMap: Record<string, Partial<Agent>> = {};
let mockAgentQueryData: Partial<Agent> | undefined;

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({ data: mockEndpointsConfig }),
  useGetAgentByIdQuery: () => ({ data: mockAgentQueryData }),
}));

jest.mock('../AgentsMapContext', () => ({
  useAgentsMapContext: () => mockAgentsMap,
}));

jest.mock('../ChatContext', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <DragDropProvider>{children}</DragDropProvider>;
}

describe('DragDropContext endpointType resolution', () => {
  beforeEach(() => {
    mockConversation = null;
    mockAgentsMap = {};
    mockAgentQueryData = undefined;
  });

  describe('non-agents endpoints', () => {
    it('resolves custom endpoint type for a custom endpoint', () => {
      mockConversation = { endpoint: 'Moonshot' };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.custom);
    });

    it('resolves endpoint name for a standard endpoint', () => {
      mockConversation = { endpoint: EModelEndpoint.openAI };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.openAI);
    });
  });

  describe('agents endpoint with provider from agentsMap', () => {
    it('resolves to custom for agent with Moonshot provider', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = {
        'agent-1': { provider: 'Moonshot', model_parameters: {} } as Partial<Agent>,
      };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.custom);
    });

    it('resolves to custom for agent with custom provider with spaces', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = {
        'agent-1': { provider: 'Some Endpoint', model_parameters: {} } as Partial<Agent>,
      };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.custom);
    });

    it('resolves to openAI for agent with openAI provider', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = {
        'agent-1': { provider: EModelEndpoint.openAI, model_parameters: {} } as Partial<Agent>,
      };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.openAI);
    });

    it('resolves to anthropic for agent with anthropic provider', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = {
        'agent-1': { provider: EModelEndpoint.anthropic, model_parameters: {} } as Partial<Agent>,
      };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.anthropic);
    });
  });

  describe('agents endpoint with provider from agentData query', () => {
    it('uses agentData when agent is not in agentsMap', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-2' };
      mockAgentsMap = {};
      mockAgentQueryData = { provider: 'Moonshot' } as Partial<Agent>;
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.custom);
    });
  });

  describe('agents endpoint without provider', () => {
    it('falls back to agents when no agent_id', () => {
      mockConversation = { endpoint: EModelEndpoint.agents };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.agents);
    });

    it('falls back to agents when agent has no provider', () => {
      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = { 'agent-1': { model_parameters: {} } as Partial<Agent> };
      const { result } = renderHook(() => useDragDropContext(), { wrapper });
      expect(result.current.endpointType).toBe(EModelEndpoint.agents);
    });
  });

  describe('consistency: same endpoint type whether used directly or through agents', () => {
    it('Moonshot resolves to the same type as direct endpoint and as agent provider', () => {
      mockConversation = { endpoint: 'Moonshot' };
      const { result: directResult } = renderHook(() => useDragDropContext(), { wrapper });

      mockConversation = { endpoint: EModelEndpoint.agents, agent_id: 'agent-1' };
      mockAgentsMap = {
        'agent-1': { provider: 'Moonshot', model_parameters: {} } as Partial<Agent>,
      };
      const { result: agentResult } = renderHook(() => useDragDropContext(), { wrapper });

      expect(directResult.current.endpointType).toBe(agentResult.current.endpointType);
    });
  });
});
