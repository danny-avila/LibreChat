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

const makeTraversalOverflowContent = () => [
  {
    type: 'custom',
    payload: Array.from({ length: 4_200 }, (_, index) => `safe-value-${index}`),
  },
];

const makeDeepModelParameter = () => {
  let value: unknown = 'safe';
  for (let depth = 0; depth < 30; depth++) {
    value = { nested: value };
  }
  return value;
};

describe('assertModelBoundContent', () => {
  it('does not traverse model-bound content for a zero-rule configuration', () => {
    const message = {
      isCreatedByUser: true,
      get text(): string {
        throw new Error('model-bound extraction should be bypassed');
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: {
          skills: {
            pii: {
              fields: ['file_text'],
              starterPatterns: [],
            },
          },
        },
        storedMessages: [message],
      }),
    ).not.toThrow();
  });

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

  it('blocks assistant-role prose that was previously submitted by a user', () => {
    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [
          {
            isCreatedByUser: false,
            isUserSubmitted: true,
            role: 'assistant',
            text: 'Imported before policy enablement: PRIVATE-VALUE',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('inspects only marked user-authored fields in a mixed assistant response', () => {
    const mixedFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['text', 'content_part'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
        },
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: mixedFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            text: 'Model generated PRIVATE-MODEL',
            content: [{ type: 'text', text: 'User edited PRIVATE-USER' }],
            userSubmittedPaths: ['/content/0/text'],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');

    expect(() =>
      assertModelBoundContent({
        filters: mixedFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            text: 'Model generated PRIVATE-MODEL',
            content: [{ type: 'text', text: 'Safe user edit' }],
            userSubmittedPaths: ['/content/0/text'],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('assembles only marked user-authored leaves in a mixed assistant response', () => {
    const assembledFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['assembled_context'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-VALUE' }],
        },
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: assembledFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            content: [
              { type: 'text', text: 'Model generated PRIVATE-MODEL' },
              { type: 'text', text: 'PRIVATE-' },
              { type: 'text', text: 'VALUE' },
            ],
            userSubmittedPaths: ['/content/1/text', '/content/2/text'],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');

    expect(() =>
      assertModelBoundContent({
        filters: assembledFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            content: [
              { type: 'text', text: 'PRIVATE-' },
              { type: 'text', text: 'VALUE' },
              { type: 'text', text: 'Safe user edit' },
            ],
            userSubmittedPaths: ['/content/2/text'],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('treats persisted steer parts as user-submitted without classifying neighboring model prose', () => {
    const mixedFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
        },
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: mixedFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            content: [
              { type: 'text', text: 'Model generated PRIVATE-MODEL' },
              { type: 'steer', steer: 'User supplied PRIVATE-STEER' },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');

    expect(() =>
      assertModelBoundContent({
        filters: mixedFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            content: [
              { type: 'text', text: 'Model generated PRIVATE-MODEL' },
              { type: 'steer', steer: 'Safe steer' },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('restores message policy semantics for user-authored HITL tool outputs', () => {
    const hitlMessage = {
      isCreatedByUser: false,
      content: [
        {
          type: 'tool_call',
          tool_call: {
            id: 'approval-1',
            args: 'PRIVATE-EDITED-ARGUMENT',
            output: 'PRIVATE-HUMAN-RESPONSE',
          },
        },
      ],
    };
    const messageFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [
            { id: 'private', label: 'private value', regex: 'PRIVATE-HUMAN-[A-Z]+' },
          ],
        },
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: messageFilters,
        storedMessages: [
          {
            ...hitlMessage,
            userSubmittedPaths: ['/content/0/tool_call/output'],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');

    expect(() =>
      assertModelBoundContent({
        filters: messageFilters,
        storedMessages: [
          {
            ...hitlMessage,
            userSubmittedPaths: ['/content/0/tool_call/args'],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('applies fail-close file policy only to marked fields in mixed assistant responses', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['content'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const storedMessage = {
      isCreatedByUser: false,
      content: [
        { type: 'input_file', file_id: 'model-file' },
        { type: 'text', text: 'User-edited text' },
      ],
    };

    expect(() =>
      assertModelBoundContent({
        filters: fileFilters,
        storedMessages: [{ ...storedMessage, userSubmittedPaths: ['/content/1/text'] }],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: fileFilters,
        storedMessages: [{ ...storedMessage, userSubmittedPaths: ['/content/0'] }],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('fails safe by inspecting the full row when provenance paths exceed the bound', () => {
    const boundedPaths = Array.from({ length: 256 }, (_, index) => `/content/${index}/text`);
    const storedMessage = {
      isCreatedByUser: false,
      text: 'Model generated PRIVATE-MODEL',
    };

    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [{ ...storedMessage, userSubmittedPaths: boundedPaths }],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [
          {
            ...storedMessage,
            userSubmittedPaths: [...boundedPaths, '/content/256/text'],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it.each([
    {
      name: 'legacy unmarked assistant prose',
      message: {
        isCreatedByUser: false,
        role: 'assistant',
        text: 'Legacy model output PRIVATE-VALUE',
      },
    },
    {
      name: 'explicitly model-authored assistant prose',
      message: {
        isCreatedByUser: false,
        isUserSubmitted: false,
        role: 'assistant',
        text: 'Model generated PRIVATE-VALUE',
      },
    },
  ])('does not treat $name as user-submitted content', ({ message }) => {
    expect(() =>
      assertModelBoundContent({
        filters,
        storedMessages: [message],
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

  it('accepts stored file locators only when backed by inspectable owner-resolved rows', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const historicalMessage = {
      isCreatedByUser: true,
      role: 'user',
      files: [{ file_id: 'file-owned' }, { file_id: 'file-missing' }],
    };
    const ownedFile = {
      file_id: 'file-owned',
      filename: 'owned.txt',
      filepath: '/uploads/owned.txt',
      text: 'safe canonical content',
    };

    expect(() =>
      assertModelBoundContent({
        filters: fileFilters,
        storedMessages: [{ ...historicalMessage, files: [{ file_id: 'file-owned' }] }],
        resolvedFiles: [ownedFile],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: fileFilters,
        storedMessages: [historicalMessage],
        resolvedFiles: [ownedFile],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('accepts a submitted locator only when it exactly matches the owner-resolved row', () => {
    const canonicalFile = {
      file_id: 'file-owned',
      filename: 'owned.txt',
      filepath: '/uploads/owned.txt',
      text: 'safe canonical content',
    };

    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            files: [
              {
                file_id: canonicalFile.file_id,
                filepath: canonicalFile.filepath,
              },
            ],
          },
        ],
        resolvedFiles: [canonicalFile],
      }),
    ).not.toThrow();
  });

  it.each([
    ['remote uri', { uri: 'https://attacker.example/private.txt' }],
    ['remote url', { url: 'https://attacker.example/private.txt' }],
    ['relative url', { url: '/api/files/untrusted' }],
    ['remote filepath', { filepath: 'https://attacker.example/private.txt' }],
    ['remote preview', { preview: 'https://attacker.example/private.txt' }],
    ['data URI', { uri: 'data:text/plain;base64,U0VDUkVU' }],
  ])('rejects an owned ID paired with a conflicting %s', (_name, locator) => {
    const canonicalFile = {
      file_id: 'file-owned',
      filename: 'owned.txt',
      filepath: '/uploads/owned.txt',
      type: 'text/plain',
      source: 'text',
      text: 'safe canonical content',
    };

    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              starterPatterns: [],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            files: [{ file_id: canonicalFile.file_id, ...locator }],
          },
        ],
        resolvedFiles: [canonicalFile],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it.each([
    ['url', { url: 'https://attacker.example/PRIVATE-FILE.txt' }],
    ['relative url', { url: '/api/files/PRIVATE-FILE.txt' }],
    ['preview', { preview: 'https://attacker.example/PRIVATE-FILE.txt' }],
  ])('inspects a conflicting %s alias in pattern mode', (_name, locator) => {
    const pattern = {
      starterPatterns: [],
      customPatterns: [
        {
          id: 'private-file',
          label: 'private file value',
          regex: 'PRIVATE-FILE',
        },
      ],
    };
    const policyVariants: FiltersConfig[] = [
      {
        files: {
          pii: {
            ...pattern,
            fields: ['uri'],
          },
        },
      },
      {
        messages: {
          pii: {
            ...pattern,
            fields: ['attachment_reference'],
          },
        },
      },
    ];

    for (const policy of policyVariants) {
      expect(() =>
        assertModelBoundContent({
          filters: policy,
          storedMessages: [
            {
              isCreatedByUser: true,
              role: 'user',
              files: [{ file_id: 'file-owned', ...locator }],
            },
          ],
          resolvedFiles: [
            {
              file_id: 'file-owned',
              filename: 'owned.txt',
              filepath: '/uploads/owned.txt',
              text: 'safe canonical content',
            },
          ],
        }),
      ).toThrow('Submitted content contains a private file value');
    }
  });

  it('preserves default allow behavior for a nonmatching conflicting locator', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['uri'],
              starterPatterns: [],
              customPatterns: [
                {
                  id: 'private-file',
                  label: 'private file value',
                  regex: 'PRIVATE-FILE',
                },
              ],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            files: [
              {
                file_id: 'file-owned',
                url: 'https://attacker.example/public.txt',
              },
            ],
          },
        ],
        resolvedFiles: [
          {
            file_id: 'file-owned',
            filename: 'owned.txt',
            filepath: '/uploads/owned.txt',
            text: 'safe canonical content',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('inspects owner-resolved file content before authorizing its stored locator', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              customPatterns: [
                {
                  id: 'private-file',
                  label: 'private file value',
                  regex: 'PRIVATE-FILE',
                },
              ],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            files: [{ file_id: 'file-owned' }],
          },
        ],
        resolvedFiles: [
          {
            file_id: 'file-owned',
            filename: 'owned.txt',
            filepath: '/uploads/owned.txt',
            text: 'PRIVATE-FILE',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private file value');
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

    expect(() =>
      assertModelBoundContent({
        filters: failClosedFilters,
        files: [
          {
            file_id: 'file-agent-context',
            filename: 'context.txt',
            filepath: '/uploads/context.txt',
            text: 'safe canonical context',
          } as never,
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              customPatterns: [
                {
                  id: 'private-context',
                  label: 'private context',
                  regex: 'PRIVATE-CONTEXT',
                },
              ],
              uninspectable: 'block',
            },
          },
        },
        files: [
          {
            file_id: 'file-agent-context',
            filename: 'context.txt',
            filepath: '/uploads/context.txt',
            text: 'PRIVATE-CONTEXT',
          } as never,
        ],
      }),
    ).toThrow('Submitted content contains a private context');
  });

  it('accepts only agent resource IDs backed by inspectable hydrated resource files', () => {
    const filters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const hydratedFile = {
      file_id: 'file-agent-context',
      filename: 'context.txt',
      filepath: '/uploads/context.txt',
      text: 'safe canonical context',
    };

    expect(() =>
      assertModelBoundContent({
        filters,
        agents: [
          {
            tool_resources: {
              context: {
                file_ids: ['file-agent-context'],
                files: [hydratedFile],
              },
            },
            agentContextAttachments: [hydratedFile],
          } as never,
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters,
        agents: [
          {
            tool_resources: {
              context: {
                file_ids: ['file-agent-context', 'unresolved-file'],
                files: [hydratedFile],
              },
            },
            agentContextAttachments: [hydratedFile],
          } as never,
        ],
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

  it('does not fail a model-only row when nested model prose exceeds the traversal budget', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          messages: {
            pii: {
              fields: ['content_part'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            content: makeTraversalOverflowContent(),
          },
        ],
      }),
    ).not.toThrow();
  });

  it('fails closed only for the selected uninspectable tool output on an assistant row', () => {
    const uninspectableOutput = new Proxy(
      { visible: 'safe' },
      {
        ownKeys() {
          throw new Error('opaque tool output');
        },
      },
    );
    const storedMessages = [
      {
        isCreatedByUser: false,
        role: 'assistant',
        tool_calls: [{ output: uninspectableOutput }],
      },
    ];

    expect(() =>
      assertModelBoundContent({
        filters: {
          toolArguments: {
            pii: {
              fields: ['output'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        storedMessages,
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');

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
        storedMessages,
      }),
    ).not.toThrow();
  });

  it('applies bounded skill and action errors only to their selected fields', () => {
    const createDeepValue = (visible: string): Record<string, unknown> => {
      const root: Record<string, unknown> = { visible };
      let current = root;
      for (let depth = 0; depth < 30; depth++) {
        const nested: Record<string, unknown> = {};
        current.nested = nested;
        current = nested;
      }
      return root;
    };
    const skill = { frontmatter: createDeepValue('visible skill value') };
    const action = { metadata: { raw_spec: createDeepValue('visible action value') } };

    expect(() =>
      assertModelBoundContent({
        filters: { skills: { pii: { fields: ['frontmatter'] } } },
        skills: [skill],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
    expect(() =>
      assertModelBoundContent({
        filters: { skills: { pii: { fields: ['instructions'] } } },
        skills: [skill],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: { actionMetadata: { pii: { fields: ['raw_spec'] } } },
        actions: [action],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
    expect(() =>
      assertModelBoundContent({
        filters: { actionMetadata: { pii: { fields: ['domain'] } } },
        actions: [action],
      }),
    ).not.toThrow();

    const privatePattern = {
      starterPatterns: [],
      customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z-]+' }],
    };
    expect(() =>
      assertModelBoundContent({
        filters: { skills: { pii: { ...privatePattern, fields: ['file_text'] } } },
        skills: [
          {
            ...skill,
            files: [{ text: 'PRIVATE-SKILL-FILE' }],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
    expect(() =>
      assertModelBoundContent({
        filters: { actionMetadata: { pii: { ...privatePattern, fields: ['domain'] } } },
        actions: [
          {
            metadata: {
              raw_spec: action.metadata.raw_spec,
              domain: 'PRIVATE-ACTION-DOMAIN',
            },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not fail submitted message traversal for an unrelated source policy', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          conversationTitles: {
            pii: {
              fields: ['title'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            content: makeTraversalOverflowContent(),
          },
        ],
      }),
    ).not.toThrow();
  });

  it('fails closed when protected submitted message content exceeds the traversal budget', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          messages: {
            pii: {
              fields: ['content_part'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: true,
            role: 'user',
            content: makeTraversalOverflowContent(),
          },
        ],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
  });

  it('still inspects structured tool arguments after overflowing model-only content', () => {
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
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            content: makeTraversalOverflowContent(),
            tool_calls: [
              {
                function: {
                  name: 'submit',
                  arguments: '{"value":"PRIVATE-TOOL"}',
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('still inspects submitted API tool arguments after overflowing nested content', () => {
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
        submittedMessages: [
          {
            role: 'assistant',
            content: makeTraversalOverflowContent(),
            tool_calls: [
              {
                function: {
                  name: 'submit',
                  arguments: '{"value":"PRIVATE-TOOL"}',
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
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

  it('fails closed for exhausted selected model request fields', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          modelParameters: {
            pii: {
              fields: ['request_fields'],
            },
          },
        },
        agents: [{ options: { provider_option: makeDeepModelParameter() } }],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
  });

  it('allows exhausted model request fields when only stop is selected', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          modelParameters: {
            pii: {
              fields: ['stop'],
            },
          },
        },
        agents: [{ options: { provider_option: makeDeepModelParameter() } }],
      }),
    ).not.toThrow();
  });

  it('fails closed when an exhausted wrapper chain could contain selected stop content', () => {
    let nested: unknown = { stop: 'PRIVATE-STOP' };
    for (let depth = 0; depth < 30; depth++) {
      nested = { options: nested };
    }

    expect(() =>
      assertModelBoundContent({
        filters: {
          modelParameters: {
            pii: {
              fields: ['stop'],
            },
          },
        },
        agents: [{ options: nested }],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
  });

  it('still inspects agent fields when unrelated model traversal is exhausted', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          agentInstructions: {
            pii: {
              fields: ['instructions'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
        agents: [
          {
            instructions: 'Previously stored PRIVATE-INSTRUCTION',
            options: { provider_option: makeDeepModelParameter() },
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
