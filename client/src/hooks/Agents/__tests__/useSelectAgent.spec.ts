import { renderHook, act } from '@testing-library/react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';

const mockNewConversation = jest.fn();
const mockFetchQuery = jest.fn();
const mockGetConversation = jest.fn();
const mockGetDefaultConversation = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ fetchQuery: mockFetchQuery })),
}));

jest.mock('~/hooks/useNewConvo', () => ({
  __esModule: true,
  default: jest.fn(() => ({ newConversation: mockNewConversation })),
}));

jest.mock('~/hooks/Conversations/useGetConversation', () => ({
  __esModule: true,
  default: jest.fn(() => mockGetConversation),
}));

jest.mock('~/hooks/Conversations/useDefaultConvo', () => ({
  __esModule: true,
  default: jest.fn(() => mockGetDefaultConversation),
}));

jest.mock('~/Providers/AgentsMapContext', () => ({
  useAgentsMapContext: jest.fn(() => ({ 'agent-1': { id: 'agent-1', name: 'Agent' } })),
}));

jest.mock('~/utils', () => ({ logger: { log: jest.fn() } }));

import useSelectAgent from '../useSelectAgent';

describe('useSelectAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConversation.mockResolvedValue({ endpoint: EModelEndpoint.agents } as TConversation);
    mockGetDefaultConversation.mockImplementation(
      ({ conversation }: { conversation: Partial<TConversation> }) => conversation,
    );
  });

  it('opens a fresh composer first and keeps it when the agent details arrive', async () => {
    mockFetchQuery.mockResolvedValue({ id: 'agent-1', name: 'Full Agent' });
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockNewConversation).toHaveBeenCalledTimes(2);
    expect(mockNewConversation.mock.calls[0][0].keepComposerState).toBe(false);
    expect(mockNewConversation.mock.calls[1][0].keepComposerState).toBe(true);
  });

  it('keeps the composer when the agent details cannot be fetched', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockFetchQuery.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockNewConversation).toHaveBeenCalledTimes(2);
    expect(mockNewConversation.mock.calls[1][0].keepComposerState).toBe(true);
    consoleError.mockRestore();
  });

  it('keeps the composer for the assistants path as well', async () => {
    mockGetConversation.mockResolvedValue({
      endpoint: EModelEndpoint.assistants,
    } as TConversation);
    mockFetchQuery.mockResolvedValue({ id: 'agent-1', name: 'Full Agent' });
    const { result } = renderHook(() => useSelectAgent());

    await act(async () => {
      await result.current.onSelect('agent-1');
    });

    expect(mockGetDefaultConversation).not.toHaveBeenCalled();
    expect(mockNewConversation.mock.calls[0][0].keepComposerState).toBe(false);
    expect(mockNewConversation.mock.calls[1][0].keepComposerState).toBe(true);
  });
});
