import { PermissionBits } from 'librechat-data-provider';
import {
  AgentInstructionPromptError,
  createAgentInstructionPromptResolver,
  resolveAgentInstructionPrompt,
} from './resolver';

function createResolver(overrides: Record<string, unknown> = {}) {
  return createAgentInstructionPromptResolver({
    canUseLibreChatPrompts: jest.fn().mockResolvedValue(true),
    getLibreChatPromptPermissions: jest.fn().mockResolvedValue(PermissionBits.VIEW),
    getLibreChatPromptGroup: jest.fn().mockResolvedValue({ name: 'Support policy' }),
    getLibreChatPrompts: jest.fn().mockResolvedValue([
      { _id: 'b', prompt: 'version two', createdAt: '2025-01-02T00:00:00.000Z' },
      { _id: 'a', prompt: 'version one', createdAt: '2025-01-01T00:00:00.000Z' },
    ]),
    langfuse: { resolve: jest.fn() },
    ...overrides,
  });
}

describe('agent instruction prompt resolver', () => {
  it('resolves the newest accessible LibreChat prompt when no version is pinned', async () => {
    const resolver = createResolver();

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Saved name' },
        { userId: 'user-1' },
      ),
    ).resolves.toEqual({
      prompt: 'version two',
      source: 'librechat',
      name: 'Support policy',
      version: 2,
    });
  });

  it('resolves a pinned LibreChat prompt version in stable creation order', async () => {
    const resolver = createResolver();

    await expect(
      resolver.resolve(
        {
          source: 'librechat',
          promptId: 'group-1',
          name: 'Support policy',
          version: 1,
          versionId: 'a',
        },
        { userId: 'user-1' },
      ),
    ).resolves.toMatchObject({ prompt: 'version one', version: 1 });
  });

  it('keeps a pinned record stable when an earlier version is deleted', async () => {
    const resolver = createResolver({
      getLibreChatPrompts: jest
        .fn()
        .mockResolvedValue([
          { _id: 'b', type: 'text', prompt: 'version two', createdAt: '2025-01-02T00:00:00.000Z' },
        ]),
    });

    await expect(
      resolver.resolve(
        {
          source: 'librechat',
          promptId: 'group-1',
          name: 'Support policy',
          version: 2,
          versionId: 'b',
        },
        { userId: 'user-1' },
      ),
    ).resolves.toMatchObject({ prompt: 'version two', version: 2 });
  });

  it('rejects a native chat prompt', async () => {
    const resolver = createResolver({
      getLibreChatPrompts: jest
        .fn()
        .mockResolvedValue([
          { _id: 'a', type: 'chat', prompt: '[]', createdAt: '2025-01-01T00:00:00.000Z' },
        ]),
    });

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Support policy' },
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ code: 'unsupported_type', statusCode: 422 });
  });

  it('requires role-level prompt use before reading prompt content', async () => {
    const getLibreChatPromptGroup = jest.fn();
    const getLibreChatPrompts = jest.fn();
    const resolver = createResolver({
      canUseLibreChatPrompts: jest.fn().mockResolvedValue(false),
      getLibreChatPromptGroup,
      getLibreChatPrompts,
    });

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Support policy' },
        { userId: 'user-1', role: 'USER' },
      ),
    ).rejects.toMatchObject({ code: 'access_denied', statusCode: 403 });
    expect(getLibreChatPromptGroup).not.toHaveBeenCalled();
    expect(getLibreChatPrompts).not.toHaveBeenCalled();
  });

  it('checks current view permission before reading prompt content', async () => {
    const getLibreChatPromptGroup = jest.fn();
    const getLibreChatPrompts = jest.fn();
    const resolver = createResolver({
      getLibreChatPromptPermissions: jest.fn().mockResolvedValue(0),
      getLibreChatPromptGroup,
      getLibreChatPrompts,
    });

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Support policy' },
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ code: 'access_denied', statusCode: 403 });
    expect(getLibreChatPromptGroup).not.toHaveBeenCalled();
    expect(getLibreChatPrompts).not.toHaveBeenCalled();
  });

  it('does not change existing inline agents', async () => {
    const agent = { instructions: 'inline instructions' };

    await resolveAgentInstructionPrompt({
      agent,
      context: { userId: 'user-1' },
      resolver: createResolver(),
    });

    expect(agent).toEqual({ instructions: 'inline instructions' });
  });

  it('replaces instructions and records resolved identity only for the current run', async () => {
    const agent: Parameters<typeof resolveAgentInstructionPrompt>[0]['agent'] = {
      instructions: '',
      instruction_prompt: {
        source: 'librechat' as const,
        promptId: 'group-1',
        name: 'Support policy',
        version: 1,
        versionId: 'a',
      },
    };

    await resolveAgentInstructionPrompt({
      agent,
      context: { userId: 'user-1' },
      resolver: createResolver(),
    });

    expect(agent.instructions).toBe('version one');
    expect(agent.resolved_instruction_prompt).toEqual({
      source: 'librechat',
      name: 'Support policy',
      version: 1,
    });
  });

  it('fails clearly when a referenced version was deleted', async () => {
    const resolver = createResolver();

    await expect(
      resolver.resolve(
        {
          source: 'librechat',
          promptId: 'group-1',
          name: 'Support policy',
          version: 3,
          versionId: 'deleted',
        },
        { userId: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(AgentInstructionPromptError);
    await expect(
      resolver.resolve(
        {
          source: 'librechat',
          promptId: 'group-1',
          name: 'Support policy',
          version: 3,
          versionId: 'deleted',
        },
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ code: 'not_found', statusCode: 404 });
  });
});
