import type { TConversation } from 'librechat-data-provider';
import { withSubmittedCodeDecision } from '../codeDecision';

const selection = { environmentId: 'personal-vm', workspaceId: 'project-a' };
const conversation = (overrides: Partial<TConversation> = {}): TConversation =>
  ({ conversationId: 'existing', ...overrides }) as TConversation;

describe('withSubmittedCodeDecision', () => {
  it('records the mode and selections the run was submitted with', () => {
    expect(
      withSubmittedCodeDecision(conversation(), {
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [selection],
      }),
    ).toEqual({
      conversationId: 'existing',
      codeEnvironmentMode: 'attached',
      codeWorkspaces: [selection],
    });
  });

  it('records a run that continues without an attached environment', () => {
    expect(
      withSubmittedCodeDecision(conversation({ codeWorkspaces: [selection] }), {
        codeEnvironmentMode: 'without_attached',
      }),
    ).toEqual({ conversationId: 'existing', codeEnvironmentMode: 'without_attached' });
  });

  /* A send that carries no decision belongs to a chat no attached environment applies to. */
  it('leaves a conversation alone when the submission carries no decision', () => {
    const current = conversation();
    expect(withSubmittedCodeDecision(current, {})).toBe(current);
    expect(withSubmittedCodeDecision(null, { codeEnvironmentMode: 'attached' })).toBeNull();
  });

  it('keeps the same conversation when it already holds the decision in another order', () => {
    const other = { environmentId: 'team-vm', workspaceId: 'shared' };
    const current = conversation({
      codeEnvironmentMode: 'attached',
      codeWorkspaces: [other, selection],
    });

    expect(
      withSubmittedCodeDecision(current, {
        codeEnvironmentMode: 'attached',
        codeWorkspaces: [selection, other],
      }),
    ).toBe(current);
  });
});
