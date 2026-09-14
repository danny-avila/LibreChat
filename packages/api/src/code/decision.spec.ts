import {
  resolveConversationCodeEnvironmentDecision,
  resolveConversationCodeEnvironmentMove,
  resolvePersistableCodeEnvironmentDecision,
} from './decision';
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

describe('resolveConversationCodeEnvironmentMove', () => {
  const mac = { environmentId: 'mac', workspaceId: 'primary' };
  const vm = { environmentId: 'vm', workspaceId: 'projects' };
  const locked = expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({
    reason: 'locked',
  });
  const sealedOn = (...codeWorkspaces: (typeof mac)[]) => ({
    conversationId: 'conversation-1',
    codeEnvironmentMode: 'attached' as const,
    codeWorkspaces,
  });

  it('replaces an environment the agents stopped using with the one they use now', () => {
    expect(
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(mac),
        from: [mac],
        to: [vm],
      }),
    ).toEqual({ codeWorkspaces: [vm] });
  });

  it('carries a covered environment over unchanged while adding a new one', () => {
    const team = { environmentId: 'team', workspaceId: 'shared' };
    expect(
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(team),
        from: [team],
        to: [vm, team],
      }),
    ).toEqual({ codeWorkspaces: [team, vm] });
  });

  it('moves a legacy decision inferred from its selections', () => {
    expect(
      resolveConversationCodeEnvironmentMove({
        conversation: { conversationId: 'conversation-1', codeWorkspaces: [mac] },
        from: [mac],
        to: [vm],
      }),
    ).toEqual({ codeWorkspaces: [vm] });
  });

  it('never switches the workspace of an environment the decision already covers', () => {
    expect(() =>
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(mac),
        from: [mac],
        to: [{ environmentId: 'mac', workspaceId: 'canary' }],
      }),
    ).toThrow(locked);
    expect(() =>
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(mac),
        from: [mac],
        to: [{ environmentId: 'mac', workspaceId: 'canary' }, vm],
      }),
    ).toThrow(locked);
  });

  it('drops an environment the agents stopped using without adding one', () => {
    const team = { environmentId: 'team', workspaceId: 'shared' };
    expect(
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(mac, team),
        from: [mac, team],
        to: [team],
      }),
    ).toEqual({ codeWorkspaces: [team] });
  });

  it('rejects a move that changes nothing', () => {
    expect(() =>
      resolveConversationCodeEnvironmentMove({
        conversation: sealedOn(mac),
        from: [mac],
        to: [mac],
      }),
    ).toThrow(locked);
  });

  it.each([
    { conversationId: 'conversation-1', codeEnvironmentMode: 'without_attached' as const },
    { conversationId: 'conversation-1' },
  ])('never upgrades a conversation that continues without an attached environment', (stored) => {
    expect(() =>
      resolveConversationCodeEnvironmentMove({ conversation: stored, from: [], to: [vm] }),
    ).toThrow(locked);
  });

  it('rejects a client acting on a decision it has not seen', () => {
    expect(() =>
      resolveConversationCodeEnvironmentMove({ conversation: sealedOn(vm), from: [mac], to: [vm] }),
    ).toThrow(locked);
  });

  it.each([[], undefined, [vm, { ...vm, workspaceId: 'other' }], [{ environmentId: 'vm' }]])(
    'rejects a malformed target: %j',
    (to) => {
      expect(() =>
        resolveConversationCodeEnvironmentMove({ conversation: sealedOn(mac), from: [mac], to }),
      ).toThrow(
        expect.objectContaining<Partial<CodeWorkspaceSelectionError>>({ reason: 'invalid' }),
      );
    },
  );
});

describe('resolvePersistableCodeEnvironmentDecision', () => {
  const mac = { environmentId: 'mac', workspaceId: 'primary' };
  const vm = { environmentId: 'vm', workspaceId: 'projects' };

  it('persists the decision a new conversation establishes', () => {
    expect(
      resolvePersistableCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        decision: { mode: 'attached', codeWorkspaces: [mac] },
      }),
    ).toEqual({ codeEnvironmentMode: 'attached', codeWorkspaces: [mac] });
    expect(
      resolvePersistableCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        decision: { mode: 'without_attached' },
      }),
    ).toEqual({ codeEnvironmentMode: 'without_attached' });
  });

  it('never writes a run-start decision over a stored one that a move replaced', () => {
    expect(
      resolvePersistableCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        decision: { mode: 'attached', codeWorkspaces: [mac] },
        conversation: {
          conversationId: 'conversation-1',
          codeEnvironmentMode: 'attached',
          codeWorkspaces: [vm],
        },
      }),
    ).toEqual({});
  });

  it('records the mode a legacy row inferred without rewriting its selections', () => {
    expect(
      resolvePersistableCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        decision: { mode: 'attached', codeWorkspaces: [mac] },
        conversation: { conversationId: 'conversation-1', codeWorkspaces: [vm] },
      }),
    ).toEqual({ codeEnvironmentMode: 'attached' });
  });

  it('treats a resolved conversation for another id as a new conversation', () => {
    expect(
      resolvePersistableCodeEnvironmentDecision({
        conversationId: 'conversation-1',
        decision: { mode: 'attached', codeWorkspaces: [mac] },
        conversation: {
          conversationId: 'another-conversation',
          codeEnvironmentMode: 'attached',
          codeWorkspaces: [vm],
        },
      }),
    ).toEqual({ codeEnvironmentMode: 'attached', codeWorkspaces: [mac] });
  });

  it('persists nothing without a validated decision', () => {
    expect(resolvePersistableCodeEnvironmentDecision({ conversationId: 'conversation-1' })).toEqual(
      {},
    );
  });
});
