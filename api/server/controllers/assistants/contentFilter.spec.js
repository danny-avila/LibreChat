const { loadThreadUserMessages, preflightAssistantRunContent } = require('./contentFilter');

function createOpenAI({ assistant, firstPage }) {
  return {
    beta: {
      assistants: {
        retrieve: jest.fn().mockResolvedValue(assistant),
      },
      threads: {
        messages: {
          list: jest.fn().mockResolvedValue(firstPage),
        },
      },
    },
  };
}

describe('Assistants model-bound content preflight', () => {
  it('does not perform remote reads when no applicable policy is configured', async () => {
    const openai = createOpenAI({});

    await expect(
      preflightAssistantRunContent({
        req: { config: {} },
        openai,
        assistantId: 'asst-1',
        threadId: 'thread-1',
      }),
    ).resolves.toBeUndefined();

    expect(openai.beta.assistants.retrieve).not.toHaveBeenCalled();
    expect(openai.beta.threads.messages.list).not.toHaveBeenCalled();
  });

  it('blocks persisted assistant instructions under a newly enabled policy', async () => {
    const openai = createOpenAI({
      assistant: {
        id: 'asst-1',
        instructions: 'Previously stored PRIVATE-INSTRUCTION',
        tools: [],
      },
    });

    await expect(
      preflightAssistantRunContent({
        req: {
          config: {
            filters: {
              agentInstructions: {
                pii: {
                  fields: ['instructions'],
                  starterPatterns: [],
                  customPatterns: [
                    { id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' },
                  ],
                },
              },
            },
          },
        },
        openai,
        assistantId: 'asst-1',
      }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: {
        source: 'agent_instruction',
        field: 'instructions',
      },
    });
  });

  it('pages remote history and inspects only user-authored messages', async () => {
    const secondPage = {
      data: [
        {
          id: 'msg-user-blocked',
          role: 'user',
          content: [{ type: 'text', text: { value: 'Historical PRIVATE-MESSAGE' } }],
        },
      ],
      hasNextPage: () => false,
    };
    const firstPage = {
      data: [
        {
          id: 'msg-model',
          role: 'assistant',
          content: [{ type: 'text', text: { value: 'PRIVATE-MODEL-OUTPUT' } }],
        },
        {
          id: 'msg-user-safe',
          role: 'user',
          content: [{ type: 'text', text: { value: 'Safe historical message' } }],
        },
      ],
      hasNextPage: () => true,
      getNextPage: jest.fn().mockResolvedValue(secondPage),
    };
    const openai = createOpenAI({ firstPage });

    await expect(
      preflightAssistantRunContent({
        req: {
          config: {
            filters: {
              messages: {
                pii: {
                  fields: ['content_part'],
                  starterPatterns: [],
                  customPatterns: [
                    { id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' },
                  ],
                },
              },
            },
          },
        },
        openai,
        assistantId: 'asst-1',
        threadId: 'thread-1',
      }),
    ).rejects.toMatchObject({
      code: 'content_filter_block',
      body: {
        source: 'message',
        field: 'content_part',
      },
    });

    expect(openai.beta.assistants.retrieve).not.toHaveBeenCalled();
    expect(openai.beta.threads.messages.list).toHaveBeenCalledWith('thread-1', {
      limit: 100,
      order: 'asc',
    });
    expect(firstPage.getNextPage).toHaveBeenCalledTimes(1);
  });

  it('fail-closes historical user file references without inspecting model output', async () => {
    const page = {
      data: [
        {
          id: 'msg-model-file',
          role: 'assistant',
          content: [{ type: 'image_file', image_file: { file_id: 'file-model' } }],
        },
        {
          id: 'msg-user-file',
          role: 'user',
          content: [{ type: 'text', text: { value: 'User file attachment' } }],
          file_ids: ['file-user'],
        },
      ],
      hasNextPage: () => false,
    };
    const openai = createOpenAI({ firstPage: page });

    await expect(
      preflightAssistantRunContent({
        req: {
          config: {
            filters: {
              files: {
                pii: {
                  fields: ['content'],
                  starterPatterns: [],
                  uninspectable: 'block',
                },
              },
            },
          },
        },
        openai,
        assistantId: 'asst-1',
        threadId: 'thread-1',
      }),
    ).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: {
        source: 'file',
        field: 'content',
      },
    });
  });

  it('does not treat remote assistant output as user-submitted history', async () => {
    const openai = createOpenAI({
      firstPage: {
        data: [
          {
            id: 'msg-model',
            role: 'assistant',
            content: [{ type: 'text', text: { value: 'PRIVATE-MODEL-OUTPUT' } }],
          },
        ],
        hasNextPage: () => false,
      },
    });

    await expect(
      preflightAssistantRunContent({
        req: {
          config: {
            filters: {
              messages: {
                pii: {
                  fields: ['content_part'],
                  starterPatterns: [],
                  customPatterns: [
                    { id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z-]+' },
                  ],
                },
              },
            },
          },
        },
        openai,
        assistantId: 'asst-1',
        threadId: 'thread-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('returns canonical user-only history from plain cursor pages', async () => {
    const openai = createOpenAI({
      firstPage: {
        data: [
          { id: 'assistant-1', role: 'assistant', content: 'ignore' },
          { id: 'user-1', role: 'user', content: 'first' },
        ],
        has_more: true,
        last_id: 'user-1',
      },
    });
    openai.beta.threads.messages.list.mockResolvedValueOnce({
      data: [
        { id: 'assistant-1', role: 'assistant', content: 'ignore' },
        { id: 'user-1', role: 'user', content: 'first' },
      ],
      has_more: true,
      last_id: 'user-1',
    });
    openai.beta.threads.messages.list.mockResolvedValueOnce({
      data: [{ id: 'user-2', role: 'user', content: 'second' }],
      has_more: false,
    });

    await expect(loadThreadUserMessages(openai, 'thread-1')).resolves.toEqual([
      expect.objectContaining({ role: 'user', content: 'first', isCreatedByUser: true }),
      expect.objectContaining({ role: 'user', content: 'second', isCreatedByUser: true }),
    ]);
    expect(openai.beta.threads.messages.list).toHaveBeenLastCalledWith('thread-1', {
      limit: 100,
      order: 'asc',
      after: 'user-1',
    });
  });

  it('fails closed when an SDK paginator repeats a page cursor', async () => {
    const repeatedPage = {
      data: [{ id: 'message-1', role: 'user', content: 'first' }],
      hasNextPage: () => true,
    };
    repeatedPage.getNextPage = jest.fn().mockResolvedValue(repeatedPage);
    const openai = createOpenAI({ firstPage: repeatedPage });

    await expect(loadThreadUserMessages(openai, 'thread-1')).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: {
        source: 'message',
        field: 'content_part',
      },
    });
    expect(repeatedPage.getNextPage).toHaveBeenCalledTimes(1);
  });
});
