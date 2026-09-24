import { AgentCapabilities, PermissionBits } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import {
  AgentInstructionPromptError,
  createAgentInstructionPromptResolver,
  resolveAgentInstructionPrompt,
  redactAgentInstructionPromptFallback,
  persistAgentInstructionPromptFallback,
} from './resolver';

function createResolver(overrides: Record<string, unknown> = {}) {
  return createAgentInstructionPromptResolver({
    canUseLibreChatPrompts: jest.fn().mockResolvedValue(true),
    getLibreChatPromptPermissions: jest.fn().mockResolvedValue(PermissionBits.VIEW),
    getLibreChatPromptGroup: jest
      .fn()
      .mockResolvedValue({ name: 'Support policy', productionId: 'a' }),
    getLibreChatPrompts: jest.fn().mockResolvedValue([
      { _id: 'b', prompt: 'version two', createdAt: '2025-01-02T00:00:00.000Z' },
      { _id: 'a', prompt: 'version one', createdAt: '2025-01-01T00:00:00.000Z' },
    ]),
    langfuse: { resolve: jest.fn() },
    ...overrides,
  });
}

describe('agent instruction prompt resolver', () => {
  it('resolves the deployed LibreChat prompt when no version is pinned', async () => {
    const resolver = createResolver();

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Saved name' },
        { userId: 'user-1' },
      ),
    ).resolves.toEqual({
      prompt: 'version one',
      source: 'librechat',
      name: 'Support policy',
      version: 1,
    });
  });

  it('does not fall forward when the deployed LibreChat prompt is unavailable', async () => {
    const resolver = createResolver({
      getLibreChatPromptGroup: jest
        .fn()
        .mockResolvedValue({ name: 'Support policy', productionId: 'missing' }),
    });

    await expect(
      resolver.resolve(
        { source: 'librechat', promptId: 'group-1', name: 'Saved name' },
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'The deployed LibreChat prompt version no longer exists',
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

  it('rejects prompt-backed saves until the rollout capability is enabled', async () => {
    await expect(
      persistAgentInstructionPromptFallback({
        agent: {
          instruction_prompt: {
            source: 'librechat',
            promptId: 'group-1',
            name: 'Support policy',
          },
        },
        context: {
          userId: 'user-1',
          appConfig: {
            endpoints: { agents: { capabilities: [] } },
          } as unknown as AppConfig,
        },
        resolver: createResolver(),
      }),
    ).rejects.toMatchObject({
      code: 'not_configured',
      status: 409,
      statusCode: 409,
    });
  });

  it('persists resolved instructions as a compatibility snapshot', async () => {
    const agent = {
      instructions: '',
      instruction_prompt: {
        source: 'librechat' as const,
        promptId: 'group-1',
        name: 'Support policy',
        version: 1,
        versionId: 'a',
      },
    };

    await persistAgentInstructionPromptFallback({
      agent,
      context: {
        userId: 'user-1',
        appConfig: {
          endpoints: {
            agents: { capabilities: [AgentCapabilities.instruction_prompts] },
          },
        } as unknown as AppConfig,
      },
      resolver: createResolver(),
    });

    expect(agent).toEqual({
      instructions: 'version one',
      instruction_prompt: {
        source: 'librechat',
        promptId: 'group-1',
        name: 'Support policy',
        version: 1,
        versionId: 'a',
      },
    });
  });
  it('re-resolves the compatibility snapshot for an instructions-only partial update', async () => {
    const existingInstructionPrompt = {
      source: 'librechat' as const,
      promptId: 'group-1',
      name: 'Support policy',
    };
    const agent: Parameters<typeof persistAgentInstructionPromptFallback>[0]['agent'] = {
      instructions: 'unrelated inline value',
    };

    await persistAgentInstructionPromptFallback({
      agent,
      existingInstructionPrompt,
      context: {
        userId: 'user-1',
        appConfig: {
          endpoints: {
            agents: { capabilities: [AgentCapabilities.instruction_prompts] },
          },
        } as unknown as AppConfig,
      },
      resolver: createResolver(),
    });

    expect(agent).toEqual({
      instructions: 'version one',
      instruction_prompt: existingInstructionPrompt,
    });
  });

  it('clears the compatibility snapshot when detaching without inline instructions', async () => {
    const agent: Parameters<typeof persistAgentInstructionPromptFallback>[0]['agent'] = {
      instruction_prompt: null,
    };
    const resolver = { resolve: jest.fn() };

    await persistAgentInstructionPromptFallback({
      agent,
      existingInstructionPrompt: {
        source: 'librechat',
        promptId: 'group-1',
        name: 'Support policy',
      },
      context: { userId: 'user-1' },
      resolver,
    });

    expect(agent).toEqual({ instructions: '', instruction_prompt: null });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('keeps explicit inline instructions when detaching a prompt', async () => {
    const agent = { instructions: 'replacement', instruction_prompt: null };

    await persistAgentInstructionPromptFallback({
      agent,
      context: { userId: 'user-1' },
    });

    expect(agent).toEqual({ instructions: 'replacement', instruction_prompt: null });
  });
  it('leaves inline instructions unchanged when null is already a no-op', async () => {
    const agent = { instruction_prompt: null };

    await persistAgentInstructionPromptFallback({
      agent,
      existingInstructionPrompt: null,
      context: { userId: 'user-1' },
    });

    expect(agent).toEqual({ instruction_prompt: null });
  });

  it('persists the resolved Langfuse destination binding', async () => {
    const agent: Parameters<typeof persistAgentInstructionPromptFallback>[0]['agent'] = {
      instructions: '',
      instruction_prompt: { source: 'langfuse', name: 'agent-policy' },
    };
    const destinationId = 'a'.repeat(64);
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        prompt: 'bound policy',
        source: 'langfuse',
        name: 'agent-policy',
        version: 1,
        destinationId,
      }),
    };

    await persistAgentInstructionPromptFallback({
      agent,
      context: {
        userId: 'user-1',
        appConfig: {
          endpoints: {
            agents: { capabilities: [AgentCapabilities.instruction_prompts] },
          },
        } as unknown as AppConfig,
      },
      resolver,
    });

    expect(agent).toEqual({
      instructions: 'bound policy',
      instruction_prompt: {
        source: 'langfuse',
        name: 'agent-policy',
        destinationId,
      },
    });
  });

  it('redacts compatibility snapshots from current and historical projections', () => {
    const agent = {
      instructions: 'current secret',
      instruction_prompt: { source: 'langfuse', name: 'current' },
      versions: [
        {
          instructions: 'historical secret',
          instruction_prompt: { source: 'langfuse', name: 'historical' },
        },
        { instructions: 'visible inline instructions' },
      ],
    };

    const redacted = redactAgentInstructionPromptFallback(agent);

    expect(redacted).not.toHaveProperty('instructions');
    expect(redacted.versions[0]).not.toHaveProperty('instructions');
    expect(redacted.versions[1].instructions).toBe('visible inline instructions');
    expect(agent.instructions).toBe('current secret');
    expect(agent.versions[0].instructions).toBe('historical secret');
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
    ).rejects.toMatchObject({ code: 'not_found', status: 404, statusCode: 404 });
  });
});
