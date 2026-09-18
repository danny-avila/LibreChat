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

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      source: 'langfuse',
      name: 'support-policy',
      version: 5,
      cached: true,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret instruction text');
  });
});
