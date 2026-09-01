import { EModelEndpoint } from 'librechat-data-provider';
import { resolveUploadEndpoint } from './routing';
import type { ServerRequest } from '~/types';

describe('resolveUploadEndpoint', () => {
  const req = { user: { id: 'user-1' } } as unknown as ServerRequest;

  beforeEach(() => {
    delete (req as unknown as { _uploadAgentCache?: unknown })._uploadAgentCache;
  });

  it('reads the agent so its provider governs an agent upload', async () => {
    const getAgent = jest.fn().mockResolvedValue({ provider: 'Custom Provider' });

    const endpoint = await resolveUploadEndpoint({
      req,
      metadata: { endpoint: EModelEndpoint.agents, agent_id: 'agent_saved01' },
      getAgent,
    });

    expect(endpoint).toBe('Custom Provider');
    expect(getAgent).toHaveBeenCalled();
  });

  it('ignores an agent id on an assistants upload', async () => {
    /* Assistants have their own pipeline and skip the agent authorization gate, so
     * resolving the named agent here would let its provider shape the validation errors
     * an unauthorized caller sees. */
    const getAgent = jest.fn().mockResolvedValue({ provider: 'Custom Provider' });

    const endpoint = await resolveUploadEndpoint({
      req,
      metadata: { endpoint: EModelEndpoint.assistants, agent_id: 'agent_victim01' },
      getAgent,
    });

    expect(endpoint).toBe(EModelEndpoint.assistants);
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('leaves an upload naming no agent alone', async () => {
    const getAgent = jest.fn();

    const endpoint = await resolveUploadEndpoint({
      req,
      metadata: { endpoint: EModelEndpoint.openAI },
      getAgent,
    });

    expect(endpoint).toBe(EModelEndpoint.openAI);
    expect(getAgent).not.toHaveBeenCalled();
  });
});
