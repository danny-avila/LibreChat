import type {
  AssertResumeRuntimeContentAllowedInput,
  ResumeContentProtectionDependencies,
  ResumeRuntimeContentProtectionDependencies,
} from './protection';
import { assertResumeContentAllowed, assertResumeRuntimeContentAllowed } from './protection';

const user = {
  id: 'user-1',
  role: 'USER',
  email: 'user@example.com',
  emailVerified: true,
  provider: 'local',
} as AssertResumeRuntimeContentAllowedInput['user'];

function createDependencies(): ResumeRuntimeContentProtectionDependencies & {
  getAgentCheckpointer: jest.Mock;
  getMessages: jest.Mock;
  getFiles: jest.Mock;
} {
  return {
    getAgentCheckpointer: jest.fn(),
    getMessages: jest.fn().mockResolvedValue([]),
    getFiles: jest.fn().mockResolvedValue([]),
  };
}

function createInput(appConfig: unknown): AssertResumeRuntimeContentAllowedInput {
  return {
    appConfig: appConfig as AssertResumeRuntimeContentAllowedInput['appConfig'],
    conversationId: 'conversation-1',
    targetMessageId: null,
    user,
    storedMessages: [],
    seedContent: [],
    liveFiles: [],
    isTemporary: true,
    agents: [],
    files: [],
  };
}

describe('assertResumeRuntimeContentAllowed', () => {
  it.each([
    { filters: { prompts: { pii: {} } } },
    {
      filters: {
        messages: {
          pii: { starterPatterns: [] },
          unattributedAssistantContent: 'inspect' as const,
        },
      },
    },
  ])('does not read checkpoints for unrelated or inert policy %#', async (appConfig) => {
    const dependencies = createDependencies();

    await expect(
      assertResumeRuntimeContentAllowed(createInput(appConfig), dependencies),
    ).resolves.toEqual({ resolvedFiles: [] });
    expect(dependencies.getAgentCheckpointer).not.toHaveBeenCalled();
    expect(dependencies.getMessages).not.toHaveBeenCalled();
    expect(dependencies.getFiles).not.toHaveBeenCalled();
  });

  it('checks initialized agent content without loading checkpoint history', async () => {
    const dependencies = createDependencies();
    const input = {
      ...createInput({
        filters: {
          agentInstructions: {
            pii: {
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
      }),
      agents: [{ instructions: 'Runtime PRIVATE-INSTRUCTION' }],
    };

    await expect(assertResumeRuntimeContentAllowed(input, dependencies)).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'agent_instruction', field: 'instructions' },
    });
    expect(dependencies.getAgentCheckpointer).not.toHaveBeenCalled();
  });

  it('rechecks checkpoint user content for an active message policy', async () => {
    const dependencies = createDependencies();
    dependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: {
          channel_values: {
            messages: [{ role: 'human', content: 'Checkpoint PRIVATE-MESSAGE' }],
          },
        },
      }),
    });
    const input = createInput({
      filters: {
        messages: {
          pii: {
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-[A-Z]+' }],
          },
        },
      },
    });

    await expect(assertResumeRuntimeContentAllowed(input, dependencies)).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'message' },
    });
    expect(dependencies.getAgentCheckpointer).toHaveBeenCalledTimes(1);
    expect(dependencies.getMessages).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      user: 'user-1',
    });
  });

  it('does not apply messages policy to checkpoint or seed assistant output', async () => {
    const dependencies = createDependencies();
    dependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: {
          channel_values: {
            messages: [{ role: 'assistant', content: 'Checkpoint PRIVATE-ASSISTANT' }],
          },
        },
      }),
    });
    const input = {
      ...createInput({
        filters: {
          messages: {
            pii: {
              fields: ['content_part'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
      }),
      seedContent: [{ type: 'text', text: 'Seed PRIVATE-ASSISTANT' }],
    };

    await expect(assertResumeRuntimeContentAllowed(input, dependencies)).resolves.toEqual({
      resolvedFiles: [],
    });
  });

  it('returns owner-hydrated resume files for the frozen model callback', async () => {
    const dependencies = createDependencies();
    dependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue(null),
    });
    const resolvedFile = {
      file_id: 'resume-file',
      filename: 'resume.txt',
      type: 'text/plain',
      text: 'Safe resume file content',
    };
    dependencies.getFiles.mockResolvedValue([resolvedFile]);
    const input = {
      ...createInput({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              uninspectable: 'block' as const,
            },
          },
        },
      }),
      storedMessages: [
        {
          messageId: 'resume-message',
          role: 'user',
          isCreatedByUser: true,
          text: 'Use the resume file',
          files: [{ file_id: 'resume-file' }],
        },
      ],
    };

    await expect(assertResumeRuntimeContentAllowed(input, dependencies)).resolves.toEqual({
      resolvedFiles: [resolvedFile],
    });
  });

  it('retains toolArguments coverage for checkpoint assistant tool calls', async () => {
    const dependencies = createDependencies();
    dependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue({
        checkpoint: {
          channel_values: {
            messages: [
              {
                role: 'assistant',
                tool_calls: [{ name: 'lookup', args: 'PRIVATE-ARGUMENT' }],
              },
            ],
          },
        },
      }),
    });
    const input = createInput({
      filters: {
        toolArguments: {
          pii: {
            fields: ['arguments'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-ARGUMENT' }],
          },
        },
      },
    });

    await expect(assertResumeRuntimeContentAllowed(input, dependencies)).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'tool_argument', field: 'arguments' },
    });
  });

  it('applies live ask answers only to the exact answer message field', async () => {
    const pattern = [{ id: 'private', label: 'private', regex: 'PRIVATE-ANSWER' }];
    const contentPartDependencies = createDependencies();
    contentPartDependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue(null),
    });
    const contentPartInput: AssertResumeRuntimeContentAllowedInput = {
      ...createInput({
        filters: {
          messages: {
            pii: { fields: ['content_part'], starterPatterns: [], customPatterns: pattern },
          },
        },
      }),
      resumeValue: { answer: 'PRIVATE-ANSWER' },
    };

    await expect(
      assertResumeRuntimeContentAllowed(contentPartInput, contentPartDependencies),
    ).resolves.toEqual({ resolvedFiles: [] });

    const answerDependencies = createDependencies();
    answerDependencies.getAgentCheckpointer.mockResolvedValue({
      getTuple: jest.fn().mockResolvedValue(null),
    });
    const answerInput: AssertResumeRuntimeContentAllowedInput = {
      ...contentPartInput,
      appConfig: createInput({
        filters: {
          messages: {
            pii: { fields: ['answer'], starterPatterns: [], customPatterns: pattern },
          },
        },
      }).appConfig,
    };

    await expect(
      assertResumeRuntimeContentAllowed(answerInput, answerDependencies),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: { source: 'message', field: 'answer' },
    });
  });

  it('does not load inactive action or memory siblings of an active agent policy', async () => {
    const dependencies: ResumeContentProtectionDependencies = {
      ...createDependencies(),
      checkAccess: jest.fn(),
      getAgent: jest.fn(),
      getActions: jest.fn().mockRejectedValue(new Error('inactive action policy was loaded')),
      getUserMemories: jest.fn().mockRejectedValue(new Error('inactive memory policy was loaded')),
      getRoleByName: jest.fn(),
      decryptMetadata: jest.fn().mockRejectedValue(new Error('inactive metadata was decrypted')),
      canAccessAgent: jest.fn().mockResolvedValue(true),
    };
    const input = {
      appConfig: {
        filters: {
          agentInstructions: {
            pii: {
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
          actionMetadata: { pii: { starterPatterns: [] } },
          toolArguments: { pii: { starterPatterns: [] } },
          memories: { pii: { starterPatterns: [] } },
        },
      },
      endpointOption: {
        agent: Promise.resolve({
          id: 'agent-1',
          provider: 'openai',
          model: 'test-model',
          instructions: 'Safe instructions',
          tools: ['lookup_action_example'],
        }),
      },
      conversationId: 'conversation-1',
      targetMessageId: null,
      user,
      storedMessages: [],
      seedContent: [],
      liveFiles: [],
      isTemporary: true,
    } as unknown as Parameters<typeof assertResumeContentAllowed>[0];

    await expect(assertResumeContentAllowed(input, dependencies)).resolves.toBeUndefined();
    expect(dependencies.getActions).not.toHaveBeenCalled();
    expect(dependencies.getUserMemories).not.toHaveBeenCalled();
    expect(dependencies.decryptMetadata).not.toHaveBeenCalled();
  });
});
