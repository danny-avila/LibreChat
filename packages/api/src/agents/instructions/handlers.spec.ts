import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createAgentInstructionPromptPreviewHandler } from './handlers';

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
    const resolver = {
      resolve: jest.fn((_reference: unknown, context: { signal: AbortSignal }) => {
        resolverSignal = context.signal;
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener('abort', () => reject(context.signal.reason), {
            once: true,
          });
        });
      }),
    };
    const handler = createAgentInstructionPromptPreviewHandler({ resolver });
    const response = createResponse();
    const request = Object.assign(new EventEmitter(), {
      query: { name: 'support-policy' },
      user: { id: 'user-1', role: 'USER' },
      aborted: false,
    });

    const pending = handler(request as unknown as Request, response);
    request.emit('aborted');
    await pending;

    expect(resolverSignal?.aborted).toBe(true);
    expect(response.status).toHaveBeenCalledWith(502);
  });
});
