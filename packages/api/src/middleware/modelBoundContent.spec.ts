import type { FiltersConfig } from 'librechat-data-provider';
import { assertModelBoundContent } from './modelBoundContent';

const filters: FiltersConfig = {
  messages: {
    pii: {
      fields: ['text'],
      starterPatterns: [],
      customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
    },
  },
};

describe('assertModelBoundContent', () => {
  it('blocks persisted model-bound messages after a policy is enabled', () => {
    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            text: 'Previously stored PRIVATE-VALUE',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not treat persisted model output as user-submitted content', () => {
    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            text: 'Model generated PRIVATE-VALUE',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('re-inspects structured historical tool output without treating assistant prose as a message', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          messages: {
            pii: {
              fields: ['text'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-PROSE' }],
            },
          },
          toolArguments: {
            pii: {
              fields: ['output'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-TOOL' }],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            text: 'Model generated PRIVATE-PROSE',
          },
          {
            isCreatedByUser: false,
            role: 'tool',
            text: 'Historical PRIVATE-TOOL result',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('preserves source granularity for reusable contexts', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          memories: {
            pii: {
              fields: ['value'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        memories: ['Previously stored PRIVATE-MEMORY'],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not classify skill content as a message', () => {
    expect(() =>
      assertModelBoundContent({
        filters,
        skills: [{ name: 'private-skill', body: 'PRIVATE-VALUE' }],
      }),
    ).not.toThrow();
  });

  it('applies a newly enabled fail-close file policy to persisted user references', () => {
    const historicalMessage = {
      isCreatedByUser: true,
      role: 'user',
      content: [{ type: 'input_file', file_id: 'file-historical' }],
    };

    expect(() =>
      assertModelBoundContent({
        storedMessages: [historicalMessage],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [historicalMessage],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('does not apply persisted-user policy to historical model output', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            content: [{ type: 'input_file', file_id: 'file-generated' }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('treats every role in a fresh API request as caller-submitted', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['content'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        submittedMessages: [
          {
            role: 'assistant',
            content: [{ type: 'input_file', file_id: 'file-caller-supplied' }],
          },
        ],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('blocks historical agent resource references and file records', () => {
    const failClosedFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: failClosedFilters,
        agents: [
          {
            tool_resources: {
              file_search: { vector_store_ids: ['vector-historical'] },
            },
          } as never,
        ],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');

    expect(() =>
      assertModelBoundContent({
        filters: failClosedFilters,
        files: [{ file_id: 'file-agent-context' } as never],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('does not let unrelated source policy or excluded file fields interfere', () => {
    const opaqueUserMessage = {
      isCreatedByUser: true,
      role: 'user',
      content: [{ type: 'input_file', file_id: 'file-opaque' }],
    };

    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [opaqueUserMessage],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['name'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [opaqueUserMessage],
      }),
    ).not.toThrow();
  });

  it('blocks initialized action schemas before they become model-bound', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          toolArguments: {
            pii: {
              fields: ['arguments'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        agents: [
          {
            toolDefinitions: [
              {
                name: 'submit_record',
                description: 'Submit a record',
                parameters: {
                  type: 'object',
                  properties: {
                    account: {
                      type: 'string',
                      description: 'Previously stored PRIVATE-SCHEMA',
                    },
                  },
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('preserves agent-instruction granularity for initialized tool descriptions', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          agentInstructions: {
            pii: {
              fields: ['description'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        agents: [
          {
            toolDefinitions: [
              {
                name: 'submit_record',
                description: 'Previously stored PRIVATE-DESCRIPTION',
                parameters: { type: 'object' },
              },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('blocks persisted Assistant function schemas under current policy', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          toolArguments: {
            pii: {
              fields: ['arguments'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        assistants: [
          {
            instructions: 'Safe instructions',
            tools: [
              {
                type: 'function',
                function: {
                  name: 'submit_record',
                  description: 'Submit a record',
                  parameters: {
                    type: 'object',
                    properties: {
                      value: {
                        type: 'string',
                        description: 'Previously stored PRIVATE-ASSISTANT-SCHEMA',
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('blocks persisted action metadata and schemas under current policy', () => {
    const action = {
      metadata: {
        domain: 'https://PRIVATE-DOMAIN.example',
        raw_spec: JSON.stringify({
          openapi: '3.0.3',
          paths: {
            '/records': {
              post: {
                operationId: 'submit_record',
                description: 'Previously stored PRIVATE-SCHEMA',
              },
            },
          },
        }),
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: {
          actionMetadata: {
            pii: {
              fields: ['domain'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        actions: [action],
      }),
    ).toThrow('Submitted content contains a private value');

    expect(() =>
      assertModelBoundContent({
        filters: {
          toolArguments: {
            pii: {
              fields: ['arguments'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        actions: [action],
      }),
    ).toThrow('Submitted content contains a private value');
  });
});
