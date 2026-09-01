import { EModelEndpoint } from 'librechat-data-provider';
import { resolveUploadEndpoint, resolveEffectiveToolResource } from './routing';
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

describe('resolveEffectiveToolResource Responses handling', () => {
  const makeReq = () =>
    ({
      user: { id: 'user-1' },
      file: { mimetype: 'application/pdf' },
      config: { fileConfig: undefined },
    }) as unknown as ServerRequest;

  it('treats the multipart string form of the Responses flag as set', async () => {
    /* Form data has no booleans, so the flag arrives as "true" and a strict comparison
     * would route an Azure PDF to extracted text on a deployment that carries it. */
    const withString = await resolveEffectiveToolResource({
      req: makeReq(),
      metadata: { endpoint: 'azureOpenAI', useResponsesApi: 'true' },
      getAgent: jest.fn(),
    });
    const withoutFlag = await resolveEffectiveToolResource({
      req: makeReq(),
      metadata: { endpoint: 'azureOpenAI' },
      getAgent: jest.fn(),
    });

    expect(withString).toBeUndefined();
    expect(withoutFlag).toBe('context');
  });
});
