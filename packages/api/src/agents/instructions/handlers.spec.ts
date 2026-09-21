import { EventEmitter } from 'node:events';
import { AgentCapabilities } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { AgentInstructionPromptProvider } from './resolver';
import { createAgentInstructionPromptPreviewHandler } from './handlers';
import { createLangfusePromptProvider } from '../../langfuse/prompts';

const enabledConfig = {
  endpoints: { agents: { capabilities: [AgentCapabilities.instruction_prompts] } },
} as AppConfig;

function createResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe('agent instruction prompt preview handler', () => {
  it.each([
    undefined,
    {} as AppConfig,
    { ...enabledConfig, endpoints: { agents: { capabilities: [] } } },
  ])(
    'rejects previews before calling the provider when the capability is disabled',
    async (config) => {
      const resolver = { resolve: jest.fn() };
      const response = createResponse();
      await createAgentInstructionPromptPreviewHandler({ resolver })(
        { query: { name: 'support-policy' }, config } as unknown as Request,
        response,
      );
      expect(response.status).toHaveBeenCalledWith(409);
      expect(response.json).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: 'not_configured' }),
      });
      expect(resolver.resolve).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed destination identities without consulting the provider', async () => {
    const resolver = { resolve: jest.fn() };
    const response = createResponse();
    await createAgentInstructionPromptPreviewHandler({ resolver })(
      {
        query: { name: 'support-policy', destinationId: 'bad' },
        config: enabledConfig,
      } as unknown as Request,
      response,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('uses the saved destination and rejects it when it becomes unavailable', async () => {
    const savedDestinationId = 'b'.repeat(64);
    const primary = {
      name: 'connection' as const,
      baseUrl: 'https://primary.example',
      authorization: 'Basic primary',
      id: 'a'.repeat(64),
    };
    const saved = {
      name: 'tenant' as const,
      baseUrl: 'https://saved.example',
      authorization: 'Basic saved',
      id: savedDestinationId,
    };
    let destinations = [primary, saved];
    const fetch = jest.fn().mockResolvedValue(
      new globalThis.Response(
        JSON.stringify({
          name: 'support-policy',
          version: 5,
          type: 'text',
          prompt: 'protected instructions',
        }),
        { status: 200 },
      ),
    );
    const resolver = createLangfusePromptProvider({
      resolveDestinations: async () => destinations,
      fetch,
    });
    const handler = createAgentInstructionPromptPreviewHandler({ resolver });
    const request = {
      query: { name: 'support-policy', version: '5', destinationId: savedDestinationId },
      config: enabledConfig,
    } as unknown as Request;
    const response = createResponse();
    await handler(request, response);
    expect(fetch).toHaveBeenCalledWith(
      'https://saved.example/api/public/v2/prompts/support-policy?version=5',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Basic saved' }),
      }),
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ destinationId: savedDestinationId, version: 5 }),
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('protected instructions');

    destinations = [primary];
    const unavailable = createResponse();
    await handler(request, unavailable);
    expect(unavailable.status).toHaveBeenCalledWith(503);
    expect(unavailable.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'not_configured' }),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns resolved identity without exposing prompt content', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        prompt: 'secret instruction text',
        source: 'langfuse',
        name: 'support-policy',
        version: 5,
        cached: true,
      }),
    };
    const handler = createAgentInstructionPromptPreviewHandler({ resolver });
    const response = createResponse();

    await handler(
      {
        query: { name: 'support-policy', version: '5' },
        user: { id: 'user-1', role: 'USER' },
        config: enabledConfig,
      } as unknown as Request,
      response,
    );

    expect(resolver.resolve).toHaveBeenCalledWith(
      { source: 'langfuse', name: 'support-policy', version: 5 },
      expect.objectContaining({
        userId: 'user-1',
        role: 'USER',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toHaveBeenCalledWith(200);

    expect(response.json).toHaveBeenCalledWith({
      source: 'langfuse',
      name: 'support-policy',
      version: 5,
      cached: true,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret instruction text');
  });
  it('aborts prompt resolution when the client disconnects', async () => {
    let resolverSignal: AbortSignal | undefined;
    const resolver: AgentInstructionPromptProvider = {
      resolve: async (_reference, context) => {
        if (!context.signal) {
          throw new Error('Expected preview cancellation signal');
        }
        resolverSignal = context.signal;
        return await new Promise<never>((_resolve, reject) => {
          context.signal?.addEventListener('abort', () => reject(context.signal?.reason), {
            once: true,
          });
        });
      },
    };
    const handler = createAgentInstructionPromptPreviewHandler({ resolver });
    const response = createResponse();
    const request = Object.assign(new EventEmitter(), {
      query: { name: 'support-policy' },
      user: { id: 'user-1', role: 'USER' },
      config: enabledConfig,
      aborted: false,
    });

    const pending = handler(request as unknown as Request, response);
    request.emit('aborted');
    await pending;

    expect(resolverSignal?.aborted).toBe(true);
    expect(response.status).toHaveBeenCalledWith(502);
  });
});
