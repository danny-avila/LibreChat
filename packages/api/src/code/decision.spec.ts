import { resolveConversationCodeEnvironmentDecision } from './decision';
import { CodeWorkspaceSelectionError } from './capabilities';

const selection = { environmentId: 'personal-vm', workspaceId: 'project-a' };

describe('resolveConversationCodeEnvironmentDecision', () => {
  it('defaults a new conversation without a selection to no attached environment', () => {
    expect(resolveConversationCodeEnvironmentDecision({ conversationId: 'new' })).toEqual({
      mode: 'without_attached',
    });
  });

  it('accepts and canonicalizes a new attached decision', () => {
    expect(
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'new',
        requestedMode: 'attached',
        requestedSelections: [{ environmentId: 'team-vm', workspaceId: 'project-b' }, selection],
      }),
    ).toEqual({
      mode: 'attached',
      codeWorkspaces: [selection, { environmentId: 'team-vm', workspaceId: 'project-b' }],
    });
  });

  it('infers legacy persisted decisions', () => {
    expect(
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        conversation: { conversationId: 'conversation-1', codeWorkspaces: [selection] },
      }),
    ).toEqual({ mode: 'attached', codeWorkspaces: [selection] });
    expect(
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        conversation: { conversationId: 'conversation-1' },
      }),
    ).toEqual({ mode: 'without_attached' });
  });

  it('allows an identical retry of a persisted decision', () => {
    expect(
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        requestedMode: 'attached',
        requestedSelections: [selection],
        conversation: {
          conversationId: 'conversation-1',
          codeEnvironmentMode: 'attached',
          codeWorkspaces: [selection],
        },
      }),
    ).toEqual({ mode: 'attached', codeWorkspaces: [selection] });
  });

  it.each([
    {
      requestedMode: 'without_attached',
      requestedSelections: undefined,
    },
    {
      requestedMode: 'attached',
      requestedSelections: [{ environmentId: 'personal-vm', workspaceId: 'project-b' }],
    },
  ])('rejects a conflicting change to a persisted attached decision', (requested) => {
    expect(() =>
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        ...requested,
        conversation: {
          conversationId: 'conversation-1',
          codeEnvironmentMode: 'attached',
          codeWorkspaces: [selection],
        },
      }),
    ).toThrow(expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'locked' }));
  });

  it('rejects attaching a workspace to a conversation locked without one', () => {
    expect(() =>
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        requestedMode: 'attached',
        requestedSelections: [selection],
        conversation: {
          conversationId: 'conversation-1',
          codeEnvironmentMode: 'without_attached',
        },
      }),
    ).toThrow(expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'locked' }));
  });

  it('rejects contradictory decision fields', () => {
    expect(() =>
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'new',
        requestedMode: 'without_attached',
        requestedSelections: [selection],
      }),
    ).toThrow(expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'invalid' }));
    expect(() =>
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'new',
        requestedMode: 'attached',
      }),
    ).toThrow(
      expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'required' }),
    );
  });

  it('rejects an invalid persisted mode instead of treating it as attached', () => {
    expect(() =>
      resolveConversationCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        conversation: {
          conversationId: 'conversation-1',
          codeEnvironmentMode: 'future-mode' as never,
          codeWorkspaces: [selection],
        },
      }),
    ).toThrow(expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'invalid' }));
  });
});
