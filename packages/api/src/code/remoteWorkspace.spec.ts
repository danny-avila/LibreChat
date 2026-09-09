import { validateResponseRequest } from '../agents/responses/service';
import { createMCPRuntimeRequestBody } from '../mcp/request';
import { validateRequest } from '../agents/openai/service';

const selections = [{ environmentId: 'machine', workspaceId: 'project' }];
describe('remote workspace selection envelopes', () => {
  it.each([
    [
      'chat completions',
      (code_workspaces: unknown) =>
        validateRequest({
          model: 'agent',
          messages: [{ role: 'user', content: 'hello' }],
          code_workspaces,
        }),
    ],
    [
      'responses',
      (code_workspaces: unknown) =>
        validateResponseRequest({ model: 'agent', input: 'hello', code_workspaces }),
    ],
  ] as const)(
    'validates %s selection identity without accepting duplicate environments',
    (_name, validate) => {
      expect(validate(selections).valid).toBe(true);
      expect(validate([...selections, ...selections]).valid).toBe(false);
      expect(validate([{ ...selections[0], path: '/secret' }]).valid).toBe(false);
    },
  );
  it('carries selections into the runtime envelope', () => {
    expect(
      createMCPRuntimeRequestBody({
        messageId: 'm',
        conversationId: 'c',
        codeWorkspaces: selections,
      }),
    ).toEqual({ messageId: 'm', conversationId: 'c', codeWorkspaces: selections });
  });
});
