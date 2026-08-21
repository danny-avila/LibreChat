import { StreamLimitExceededError } from '@librechat/agents';
import type { FiltersConfig } from 'librechat-data-provider';
import {
  assertModelBoundContent,
  assertModelBoundProviderContent,
  collectModelBoundHistoricalFileIds,
  createModelBoundChatModelCallback,
  createInitialModelBoundAdmissionCallback,
  hasModelBoundContentProtection,
  projectModelBoundSourceFiles,
} from './modelBoundContent';
import { isContentFilterError } from './contentFilter';

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

describe('hasModelBoundContentProtection', () => {
  it.each([
    undefined,
    { prompts: { pii: {} } },
    { conversationTitles: { pii: {} } },
    { feedback: { pii: {} } },
    {
      messages: {
        pii: { starterPatterns: [] },
        unattributedAssistantContent: 'inspect' as const,
      },
    },
  ])('does not activate for management-only or inert config %#', (candidate) => {
    expect(hasModelBoundContentProtection(candidate)).toBe(false);
  });

  it.each([
    'messages',
    'agentInstructions',
    'conversationStarters',
    'skills',
    'memories',
    'toolArguments',
    'modelParameters',
    'actionMetadata',
  ] as const)('activates for the %s source', (source) => {
    expect(
      hasModelBoundContentProtection({
        [source]: { pii: {} },
      }),
    ).toBe(true);
  });

  it('activates for legacy patterns and fail-close file inspection', () => {
    expect(hasModelBoundContentProtection(undefined, {})).toBe(true);
    expect(
      hasModelBoundContentProtection({
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            uninspectable: 'block',
          },
        },
      }),
    ).toBe(true);
  });
});

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

  it('applies legacy-only rules across adjacent persisted submitted content parts', () => {
    expect(() =>
      assertModelBoundContent({
        legacyPii: {
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-VALUE' }],
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            content: [
              { type: 'text', text: 'Model output' },
              { type: 'text', text: 'PRIVATE-' },
              { type: 'text', text: 'VALUE' },
            ],
            userSubmittedPaths: ['/content/1/text', '/content/2/text'],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
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

  it('keeps legacy generic HITL provenance compatible with content_part policy', () => {
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

  it.each([
    {
      field: 'answer' as const,
      selectedIndex: 0,
      siblingIndex: 1,
    },
    {
      field: 'decision_response' as const,
      selectedIndex: 1,
      siblingIndex: 2,
    },
    {
      field: 'decision_reason' as const,
      selectedIndex: 2,
      siblingIndex: 0,
    },
  ])(
    'restores exact persisted $field policy without blocking sibling HITL fields',
    ({ field, selectedIndex, siblingIndex }) => {
      const semanticFields = ['answer', 'decision_response', 'decision_reason'] as const;
      const makeMessage = (privateIndex: number) => ({
        isCreatedByUser: false,
        role: 'assistant',
        content: semanticFields.map((semanticField, index) => ({
          type: 'tool_call',
          tool_call: {
            output: index === privateIndex ? 'PRIVATE-HITL' : `safe-${semanticField}`,
          },
        })),
        userSubmittedMessageFieldPaths: semanticFields.map((semanticField, index) => ({
          path: `/content/${index}/tool_call/output`,
          field: semanticField,
        })),
      });
      const fieldFilters: FiltersConfig = {
        messages: {
          pii: {
            fields: [field],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
          },
        },
      };

      expect(() =>
        assertModelBoundContent({
          filters: fieldFilters,
          storedMessages: [makeMessage(selectedIndex)],
        }),
      ).toThrow('Submitted content contains a private value');

      expect(() =>
        assertModelBoundContent({
          filters: fieldFilters,
          storedMessages: [makeMessage(siblingIndex)],
        }),
      ).not.toThrow();
    },
  );

  it('does not reclassify exact persisted HITL fields as content_part or assembled_context', () => {
    const semanticMessage = {
      isCreatedByUser: false,
      role: 'assistant',
      content: [
        {
          type: 'tool_call',
          tool_call: { output: 'PRIVATE-HITL' },
        },
      ],
      userSubmittedMessageFieldPaths: [
        { path: '/content/0/tool_call/output', field: 'answer' as const },
      ],
    };
    const genericFilters = (field: 'content_part' | 'assembled_context'): FiltersConfig => ({
      messages: {
        pii: {
          fields: [field],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
        },
      },
    });

    expect(() =>
      assertModelBoundContent({
        filters: genericFilters('content_part'),
        storedMessages: [semanticMessage],
      }),
    ).not.toThrow();
    expect(() =>
      assertModelBoundContent({
        filters: genericFilters('assembled_context'),
        storedMessages: [semanticMessage],
      }),
    ).not.toThrow();
  });

  it('fails closed for uninspectable exact persisted HITL content under legacy policy', () => {
    expect(() =>
      assertModelBoundContent({
        legacyPii: {
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            content: makeTraversalOverflowContent(),
            userSubmittedMessageFieldPaths: [{ path: '/content/0', field: 'answer' }],
          },
        ],
      }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
  });

  it('fails closed only when the uninspectable exact HITL field is selected', () => {
    const makeFilters = (field: 'answer' | 'decision_reason'): FiltersConfig => ({
      messages: {
        pii: {
          fields: [field],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
        },
      },
    });
    const storedMessages = [
      {
        isCreatedByUser: false,
        role: 'assistant',
        content: makeTraversalOverflowContent(),
        userSubmittedMessageFieldPaths: [{ path: '/content/0', field: 'answer' as const }],
      },
    ];

    expect(() =>
      assertModelBoundContent({ filters: makeFilters('answer'), storedMessages }),
    ).toThrow('Submitted content could not be completely inspected before processing.');
    expect(() =>
      assertModelBoundContent({ filters: makeFilters('decision_reason'), storedMessages }),
    ).not.toThrow();
  });

  it('retains toolArguments.output coverage for exact persisted HITL fields', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          toolArguments: {
            pii: {
              fields: ['output'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
            },
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                tool_call: { output: 'PRIVATE-HITL' },
              },
            ],
            userSubmittedMessageFieldPaths: [
              { path: '/content/0/tool_call/output', field: 'answer' },
            ],
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
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

  it('keeps explicit model_output attribution compatible with omission', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          ...filters,
          messages: {
            ...filters.messages,
            unattributedAssistantContent: 'model_output',
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            text: 'Legacy model output PRIVATE-VALUE',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('inspects unattributed assistant rows when strict legacy attribution is enabled', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          ...filters,
          messages: {
            ...filters.messages,
            unattributedAssistantContent: 'inspect',
          },
        },
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            text: 'Legacy unattributed PRIVATE-VALUE',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('recognizes an assistant role as unattributed even without an author flag', () => {
    expect(() =>
      assertModelBoundContent({
        filters: {
          ...filters,
          messages: {
            ...filters.messages,
            unattributedAssistantContent: 'inspect',
          },
        },
        storedMessages: [
          {
            role: 'assistant',
            text: 'Legacy unattributed PRIVATE-VALUE',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('honors explicit model attribution and path-scoped user attribution in strict mode', () => {
    const strictFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['text', 'content_part'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
        },
        unattributedAssistantContent: 'inspect',
      },
    };

    expect(() =>
      assertModelBoundContent({
        filters: strictFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            isUserSubmitted: false,
            role: 'assistant',
            text: 'Explicit model output PRIVATE-VALUE',
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: strictFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            isUserSubmitted: false,
            role: 'assistant',
            text: 'Model output PRIVATE-MODEL',
            content: [{ type: 'text', text: 'Safe user edit' }],
            userSubmittedPaths: ['/content/0/text'],
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundContent({
        filters: strictFilters,
        storedMessages: [
          {
            isCreatedByUser: false,
            role: 'assistant',
            text: 'Model output PRIVATE-MODEL',
            content: [
              { type: 'text', text: 'Model content' },
              { type: 'steer', steer: 'Safe user steer' },
            ],
          },
        ],
      }),
    ).not.toThrow();
  });

  it.each(['not-a-json-pointer', '/missing', '/messageId', '/__proto__/polluted'])(
    'treats ineffective provenance path %s as unattributed in strict mode',
    (userSubmittedPath) => {
      expect(() =>
        assertModelBoundContent({
          filters: {
            ...filters,
            messages: {
              ...filters.messages,
              unattributedAssistantContent: 'inspect',
            },
          },
          storedMessages: [
            {
              isCreatedByUser: false,
              role: 'assistant',
              messageId: 'legacy-message',
              text: 'Legacy unattributed PRIVATE-VALUE',
              userSubmittedPaths: [userSubmittedPath],
            },
          ],
        }),
      ).toThrow('Submitted content contains a private value');
    },
  );

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

describe('assertModelBoundProviderContent', () => {
  it('collects every provider-supported historical file locator', () => {
    expect(
      collectModelBoundHistoricalFileIds([
        {
          files: [{ file_id: 'top-file' }],
          attachments: [{ file_id: 'display-file' }],
          content: [
            { type: 'input_file', files: [{ file_id: 'part-file' }] },
            { type: 'input_image', image_file: { file_id: 'image-file' } },
            { type: 'input_file', file_id: 'direct-file' },
            { type: 'input_file', file: { file_id: 'nested-file' } },
            { type: 'input_file', files: [{ file_id: 'part-file' }] },
          ],
        },
      ]),
    ).toEqual([
      'top-file',
      'display-file',
      'part-file',
      'image-file',
      'direct-file',
      'nested-file',
    ]);
  });

  it('projects source-bound and canonical files in typed backend code', () => {
    const historicalFile = {
      file_id: 'historical-file',
      filename: 'history.txt',
      text: 'historical canonical text',
    };
    const processedCurrentFile = {
      file_id: 'current-file',
      filename: 'current.png',
      type: 'image/png',
    };
    const canonicalCurrentFile = {
      ...processedCurrentFile,
      text: 'current canonical OCR text',
    };

    const withoutReplay = projectModelBoundSourceFiles({
      messageFilesBySourceMessageId: {
        ' source-message ': [{ file_id: 'current-file' }, { file_id: 'current-file' }],
      },
      steerFileIdsBySourceMessageId: new Map([
        ['source-message', new Set(['steer-file', 'current-file'])],
      ]),
      replayHistoricalFiles: false,
      historicalFiles: [historicalFile],
      processedCurrentFiles: [processedCurrentFile],
      canonicalCurrentFiles: [canonicalCurrentFile],
    });

    expect(withoutReplay.fileIdsBySourceMessageId).toEqual(
      new Map([['source-message', ['current-file', 'steer-file']]]),
    );
    expect(withoutReplay.resolvedFiles).toEqual([canonicalCurrentFile]);

    expect(
      projectModelBoundSourceFiles({
        replayHistoricalFiles: true,
        historicalFiles: [historicalFile],
      }).resolvedFiles,
    ).toEqual([historicalFile]);
  });

  it('inspects only canonical rows selected by the final provider payload', () => {
    const storedMessages = [
      {
        messageId: 'pruned-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Previously stored PRIVATE-PRUNED',
      },
      {
        messageId: 'retained-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Safe retained content',
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages,
        providerMessages: [
          {
            role: 'human',
            content: 'Safe retained content',
            additional_kwargs: { sourceMessageId: 'retained-message' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages,
        providerMessages: [
          {
            role: 'human',
            content: 'Previously stored PRIVATE-PRUNED',
            additional_kwargs: { sourceMessageId: 'pruned-message' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('inspects only the provider-bound name rather than persisted UI labels', () => {
    const nameFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['name'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-SENDER' }],
        },
      },
    };
    const storedMessages = [
      {
        messageId: 'named-user',
        role: 'user',
        isCreatedByUser: true,
        sender: 'PRIVATE-SENDER',
        name: 'PRIVATE-SENDER',
        text: 'Safe retained content',
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters: nameFilters,
        storedMessages,
        providerMessages: [
          {
            role: 'human',
            content: 'Safe retained content',
            additional_kwargs: { sourceMessageId: 'named-user' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: nameFilters,
        storedMessages,
        providerMessages: [
          {
            role: 'human',
            name: 'PRIVATE-SENDER',
            content: 'Safe retained content',
            additional_kwargs: { sourceMessageId: 'named-user' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('mirrors provider content precedence over stale persisted text metadata', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages: [
          {
            messageId: 'content-user',
            role: 'user',
            isCreatedByUser: true,
            text: 'PRIVATE-STALE',
            summary: 'PRIVATE-STALE',
            original: 'PRIVATE-STALE',
            updated: 'PRIVATE-STALE',
            content: [{ type: 'text', text: 'Safe retained content' }],
          },
        ],
        providerMessages: [
          {
            role: 'human',
            content: 'Safe retained content',
            additional_kwargs: { sourceMessageId: 'content-user' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters,
        providerMessages: [
          {
            role: 'human',
            text: 'PRIVATE-STALE',
            content: [{ type: 'text', text: 'Safe exact provider content' }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('selects historical files only for retained source rows', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
        },
      },
    };
    const storedMessages = [
      {
        messageId: 'pruned-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Pruned file turn',
        files: [{ file_id: 'pruned-file' }],
      },
      {
        messageId: 'retained-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Retained safe turn',
      },
    ];
    const resolvedFiles = [
      {
        file_id: 'pruned-file',
        filename: 'private.txt',
        text: 'PRIVATE-FILE',
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        resolvedFiles,
        fileIdsBySourceMessageId: new Map([['pruned-message', ['pruned-file']]]),
        providerMessages: [
          {
            role: 'human',
            content: 'Retained safe turn',
            additional_kwargs: { sourceMessageId: 'retained-message' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        resolvedFiles,
        fileIdsBySourceMessageId: new Map([['pruned-message', ['pruned-file']]]),
        providerMessages: [
          {
            role: 'human',
            content: 'Pruned file turn',
            additional_kwargs: { sourceMessageId: 'pruned-message' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('selects only user-authored file references from retained assistant rows', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
        },
      },
    };
    const resolvedFiles = [
      {
        file_id: 'assistant-file',
        filename: 'private.txt',
        text: 'PRIVATE-FILE',
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        resolvedFiles,
        storedMessages: [
          {
            messageId: 'model-file-message',
            isCreatedByUser: false,
            role: 'assistant',
            content: [{ type: 'input_file', file_id: 'assistant-file' }],
          },
        ],
        providerMessages: [
          {
            role: 'ai',
            content: [{ type: 'input_file', file_id: 'assistant-file' }],
            additional_kwargs: { sourceMessageId: 'model-file-message' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        resolvedFiles,
        fileIdsBySourceMessageId: new Map([['steer-file-message', ['assistant-file']]]),
        storedMessages: [
          {
            messageId: 'steer-file-message',
            isCreatedByUser: false,
            role: 'assistant',
            content: [
              {
                type: 'steer',
                steer: 'Use this file',
                files: [{ file_id: 'assistant-file' }],
              },
            ],
          },
        ],
        providerMessages: [
          {
            role: 'human',
            content: 'Use this file',
            additional_kwargs: { sourceMessageId: 'steer-file-message' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('ignores canonical steer locators when no file was materialized', () => {
    expect(() =>
      assertModelBoundProviderContent({
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
            messageId: 'failed-steer',
            isCreatedByUser: false,
            role: 'assistant',
            content: [
              {
                type: 'steer',
                steer: 'Text-only fallback',
                files: [{ file_id: 'not-materialized' }],
              },
            ],
          },
        ],
        providerMessages: [
          {
            role: 'human',
            content: 'Text-only fallback',
            additional_kwargs: { sourceMessageId: 'failed-steer', source: 'steer' },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('uses only the source row that actually materialized a repeated file', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
        },
      },
    };
    const storedMessages = [
      {
        messageId: 'first-source',
        isCreatedByUser: true,
        role: 'user',
        files: [{ file_id: 'shared-file' }],
      },
      {
        messageId: 'later-source',
        isCreatedByUser: true,
        role: 'user',
        files: [{ file_id: 'shared-file' }],
      },
    ];
    const resolvedFiles = [
      { file_id: 'shared-file', filename: 'private.txt', text: 'PRIVATE-FILE' },
    ];
    const fileIdsBySourceMessageId = new Map([['first-source', ['shared-file']]]);

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        resolvedFiles,
        fileIdsBySourceMessageId,
        providerMessages: [
          {
            role: 'human',
            content: 'Later text-only source',
            additional_kwargs: { sourceMessageId: 'later-source' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        resolvedFiles,
        fileIdsBySourceMessageId,
        providerMessages: [
          {
            role: 'human',
            content: 'First source with file',
            additional_kwargs: { sourceMessageId: 'first-source' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('fails closed for an unresolved file only when its source is retained', () => {
    const fileFilters: FiltersConfig = {
      files: {
        pii: {
          fields: ['extracted_text'],
          starterPatterns: [],
          uninspectable: 'block',
        },
      },
    };
    const storedMessages = [
      {
        messageId: 'missing-file-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Use the missing file',
        files: [{ file_id: 'missing-file' }],
      },
      {
        messageId: 'safe-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'Safe retained turn',
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        fileIdsBySourceMessageId: new Map([['missing-file-message', ['missing-file']]]),
        providerMessages: [
          {
            role: 'human',
            content: 'Safe retained turn',
            additional_kwargs: { sourceMessageId: 'safe-message' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: fileFilters,
        storedMessages,
        fileIdsBySourceMessageId: new Map([['missing-file-message', ['missing-file']]]),
        providerMessages: [
          {
            role: 'human',
            content: 'Use the missing file',
            additional_kwargs: { sourceMessageId: 'missing-file-message' },
          },
        ],
      }),
    ).toThrow('Submitted file content could not be inspected before processing.');
  });

  it('does not treat display-only historical attachments as model-bound files', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
              uninspectable: 'block',
            },
          },
        },
        storedMessages: [
          {
            messageId: 'display-only',
            isCreatedByUser: true,
            role: 'user',
            text: 'Download this later',
            attachments: [{ file_id: 'display-file' }],
          },
        ],
        resolvedFiles: [
          {
            file_id: 'display-file',
            filename: 'private.txt',
            text: 'PRIVATE-FILE',
          },
        ],
        providerMessages: [
          {
            role: 'human',
            content: 'Download this later',
            additional_kwargs: { sourceMessageId: 'display-only' },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('fails safe on an ambiguous coalesced user payload while retaining canonical provenance', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages: [
          {
            messageId: 'first-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe first turn',
          },
          {
            messageId: 'last-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe last turn',
          },
        ],
        providerMessages: [
          {
            id: 'first-message',
            role: 'human',
            content: 'Safe first turn\nPRIVATE-MIDDLE\nSafe last turn',
            additional_kwargs: { sourceMessageId: 'last-message' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('inspects synthetic user content merged behind one persisted source identity', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages: [
          {
            messageId: 'stored-user',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe persisted turn',
          },
        ],
        providerMessages: [
          {
            id: 'stored-user',
            role: 'human',
            content: 'Safe persisted turn\n\nPRIVATE-SYNTHETIC',
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not reclassify synthetic skill context as a submitted message', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters,
        providerMessages: [
          {
            role: 'human',
            content: 'Skill body with PRIVATE-SKILL',
            additional_kwargs: { isMeta: true, source: 'skill' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters,
        providerMessages: [
          {
            role: 'human',
            content: 'Injected PRIVATE-STEER',
            additional_kwargs: { injected: true, source: 'steer' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('retains explicit caller provenance on assistant-role provider messages', () => {
    const contentPartFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-EDIT' }],
        },
      },
    };
    expect(() =>
      assertModelBoundProviderContent({
        filters: contentPartFilters,
        storedMessages: [
          {
            messageId: 'edited-assistant',
            isCreatedByUser: false,
            role: 'assistant',
            content: [{ type: 'text', text: 'PRIVATE-EDIT' }],
            userSubmittedPaths: ['/content/0/text'],
          },
        ],
        providerMessages: [
          {
            role: 'ai',
            content: 'PRIVATE-EDIT',
            additional_kwargs: { sourceMessageId: 'edited-assistant' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');

    const answerFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['answer'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-HITL' }],
        },
      },
    };
    expect(() =>
      assertModelBoundProviderContent({
        filters: answerFilters,
        storedMessages: [
          {
            messageId: 'hitl-assistant',
            isCreatedByUser: false,
            role: 'assistant',
            content: [{ type: 'tool_call', tool_call: { output: 'PRIVATE-HITL' } }],
            userSubmittedMessageFieldPaths: [
              { path: '/content/0/tool_call/output', field: 'answer' },
            ],
          },
        ],
        providerMessages: [
          {
            role: 'ai',
            content: 'PRIVATE-HITL',
            additional_kwargs: { sourceMessageId: 'hitl-assistant' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('fails closed when an assistant payload assembles content across an edit boundary', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters,
        storedMessages: [
          {
            messageId: 'edited-boundary',
            isCreatedByUser: false,
            role: 'assistant',
            content: [
              { type: 'text', text: 'PRIVATE-' },
              { type: 'text', text: 'SECRET' },
            ],
            userSubmittedPaths: ['/content/0/text'],
          },
        ],
        providerMessages: [
          {
            role: 'ai',
            content: 'PRIVATE-SECRET',
            additional_kwargs: { sourceMessageId: 'edited-boundary' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not restore a pruned steer when only a safe assistant derivative survives', () => {
    const contentFilters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['content_part'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-STEER' }],
        },
      },
    };
    const storedMessages = [
      {
        messageId: 'mixed-assistant',
        isCreatedByUser: false,
        role: 'assistant',
        content: [
          { type: 'steer', steer: 'PRIVATE-STEER' },
          { type: 'text', text: 'Safe model tail' },
        ],
        userSubmittedPaths: ['/content/0/steer'],
      },
    ];

    expect(() =>
      assertModelBoundProviderContent({
        filters: contentFilters,
        storedMessages,
        providerMessages: [
          {
            role: 'ai',
            content: 'Safe model tail',
            additional_kwargs: { sourceMessageId: 'mixed-assistant' },
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertModelBoundProviderContent({
        filters: contentFilters,
        storedMessages,
        providerMessages: [
          {
            role: 'human',
            content: 'PRIVATE-STEER',
            additional_kwargs: { sourceMessageId: 'mixed-assistant' },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('does not infer a pruned middle source from legacy coalescing identities', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
            },
          },
        },
        storedMessages: [
          {
            messageId: 'first-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe first turn',
          },
          {
            messageId: 'middle-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Use the middle file',
            files: [{ file_id: 'middle-file' }],
          },
          {
            messageId: 'last-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe last turn',
          },
        ],
        resolvedFiles: [
          {
            file_id: 'middle-file',
            filename: 'middle.txt',
            text: 'PRIVATE-FILE',
          },
        ],
        fileIdsBySourceMessageId: new Map([['middle-message', ['middle-file']]]),
        providerMessages: [
          {
            id: 'first-message',
            role: 'human',
            content: 'Safe first turn\n\nSafe last turn',
            additional_kwargs: { sourceMessageId: 'last-message' },
          },
        ],
      }),
    ).not.toThrow();
  });

  it('selects every canonical source carried by plural coalescing lineage', () => {
    expect(() =>
      assertModelBoundProviderContent({
        filters: {
          files: {
            pii: {
              fields: ['extracted_text'],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-FILE' }],
            },
          },
        },
        storedMessages: [
          {
            messageId: 'first-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe first turn',
          },
          {
            messageId: 'middle-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Use the middle file',
            files: [{ file_id: 'middle-file' }],
          },
          {
            messageId: 'last-message',
            isCreatedByUser: true,
            role: 'user',
            text: 'Safe last turn',
          },
        ],
        resolvedFiles: [
          {
            file_id: 'middle-file',
            filename: 'middle.txt',
            text: 'PRIVATE-FILE',
          },
        ],
        fileIdsBySourceMessageId: new Map([['middle-message', ['middle-file']]]),
        providerMessages: [
          {
            id: 'first-message',
            role: 'human',
            content: 'Safe first turn\n\nUse the middle file\n\nSafe last turn',
            additional_kwargs: {
              sourceMessageId: 'last-message',
              sourceMessageIds: ['first-message', 'middle-message', 'last-message'],
            },
          },
        ],
      }),
    ).toThrow('Submitted content contains a private value');
  });

  it('keeps the model callback usable after caller-owned state is released', () => {
    const storedMessages = [
      {
        messageId: 'stored-message',
        isCreatedByUser: true,
        role: 'user',
        text: 'PRIVATE-SNAPSHOT',
      },
    ];
    const callback = createModelBoundChatModelCallback({ filters, storedMessages });
    storedMessages.length = 0;

    expect(() =>
      callback.handleChatModelStart(undefined, [
        [
          {
            role: 'human',
            content: 'PRIVATE-SNAPSHOT',
            additional_kwargs: { sourceMessageId: 'stored-message' },
          },
        ],
      ]),
    ).toThrow('Submitted content contains a private value');
  });

  it('marks callback policy failures fatal across SDK recovery paths', () => {
    const onContentRejected = jest.fn();
    const callback = createModelBoundChatModelCallback({ filters }, { onContentRejected });
    let thrown: unknown;

    try {
      callback.handleChatModelStart(undefined, [[{ role: 'human', content: 'PRIVATE-CALLBACK' }]]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StreamLimitExceededError);
    expect(isContentFilterError(thrown)).toBe(true);
    expect(onContentRejected).toHaveBeenCalledTimes(1);
    expect(thrown).toMatchObject({
      code: 'content_filter_block',
      statusCode: 400,
      message: 'Submitted content contains a private value. Remove it and try again.',
      cause: expect.objectContaining({ code: 'content_filter_block' }),
    });
  });

  const startRootModelAttempt = (
    callback: ReturnType<typeof createInitialModelBoundAdmissionCallback>,
    agentId: string,
    prefix: string,
  ) => {
    const agentNodeRunId = `${prefix}-agent-node`;
    const modelChainRunId = `${prefix}-model-chain`;
    const modelRunId = `${prefix}-llm`;
    const metadata = { agentId, langgraph_node: `agent=${agentId}` };

    callback.handleChainStart(
      undefined,
      {},
      agentNodeRunId,
      `${prefix}-graph`,
      undefined,
      { langgraph_node: `agent=${agentId}` },
      undefined,
      `agent=${agentId}`,
    );
    callback.handleChainStart(
      undefined,
      {},
      modelChainRunId,
      agentNodeRunId,
      undefined,
      metadata,
      undefined,
      'AgentModelCall',
    );
    callback.handleChatModelStart(
      undefined,
      [[{ role: 'human', content: `Safe ${agentId} input` }]],
      modelRunId,
      modelChainRunId,
      undefined,
      undefined,
      metadata,
    );

    return { agentNodeRunId, modelChainRunId, modelRunId };
  };

  it('admits persistence only after the safe starting-agent node completes', () => {
    const onAllowed = jest.fn();
    const callback = createInitialModelBoundAdmissionCallback({
      agentIds: ['agent-root'],
      isActive: () => true,
      onAllowed,
    });

    const runs = startRootModelAttempt(callback, 'agent-root', 'root');
    callback.handleLLMEnd({}, runs.modelRunId);
    expect(onAllowed).not.toHaveBeenCalled();

    /** AgentModelCall ends before post-stream validation and fallback selection. */
    callback.handleChainEnd({}, runs.modelChainRunId);
    expect(onAllowed).not.toHaveBeenCalled();

    callback.handleChainEnd({ messages: [{}] }, runs.agentNodeRunId);
    expect(onAllowed).toHaveBeenCalledTimes(1);
  });

  it('waits for every parallel starting agent and cannot revive after a policy rejection', () => {
    let active = true;
    const onAllowed = jest.fn();
    const callback = createInitialModelBoundAdmissionCallback({
      agentIds: ['agent-a', 'agent-b'],
      isActive: () => active,
      onAllowed,
    });

    const runsA = startRootModelAttempt(callback, 'agent-a', 'a');
    callback.handleLLMEnd({}, runsA.modelRunId);
    callback.handleChainEnd({}, runsA.modelChainRunId);
    callback.handleChainEnd({ messages: [{}] }, runsA.agentNodeRunId);
    expect(onAllowed).not.toHaveBeenCalled();

    /** The intrinsic content callback cancels the persistence controller
     * synchronously when the sibling root is rejected. */
    active = false;

    const runsB = startRootModelAttempt(callback, 'agent-b', 'b-late');
    callback.handleLLMEnd({}, runsB.modelRunId);
    callback.handleChainEnd({}, runsB.modelChainRunId);
    callback.handleChainEnd({ messages: [{}] }, runsB.agentNodeRunId);
    expect(onAllowed).not.toHaveBeenCalled();
  });

  it('does not let summarization or a downstream node satisfy root admission', () => {
    const onAllowed = jest.fn();
    const callback = createInitialModelBoundAdmissionCallback({
      agentIds: ['agent-root'],
      isActive: () => true,
      onAllowed,
    });

    callback.handleChainStart(
      undefined,
      {},
      'summary-node',
      'graph',
      undefined,
      { langgraph_node: 'summarize=agent-root', summarization: true },
      undefined,
      'summarize=agent-root',
    );
    callback.handleChatModelStart(
      undefined,
      [[{ role: 'human', content: 'Safe summary' }]],
      'summary-llm',
      'summary-node',
      undefined,
      undefined,
      {
        agentId: 'agent-root',
        langgraph_node: 'summarize=agent-root',
        summarization: true,
      },
    );
    callback.handleLLMEnd({}, 'summary-llm');
    callback.handleChainEnd({ messages: [{}] }, 'summary-node');
    callback.handleChainStart(
      undefined,
      {},
      'downstream-node',
      'graph',
      undefined,
      { langgraph_node: 'agent=agent-child' },
      undefined,
      'agent=agent-child',
    );
    callback.handleChatModelStart(
      undefined,
      [[{ role: 'human', content: 'Safe downstream input' }]],
      'downstream-llm',
      'downstream-node',
      undefined,
      undefined,
      { agentId: 'agent-child', langgraph_node: 'agent=agent-child' },
    );
    callback.handleLLMEnd({}, 'downstream-llm');
    callback.handleChainEnd({ messages: [{}] }, 'downstream-node');

    expect(onAllowed).not.toHaveBeenCalled();
  });

  it('keeps the root pending across a summarization detour after a completed model attempt', () => {
    const onAllowed = jest.fn();
    const callback = createInitialModelBoundAdmissionCallback({
      agentIds: ['agent-root'],
      isActive: () => true,
      onAllowed,
    });

    const beforeSummary = startRootModelAttempt(callback, 'agent-root', 'before-summary');
    callback.handleLLMEnd({}, beforeSummary.modelRunId);
    callback.handleChainEnd({}, beforeSummary.modelChainRunId);
    callback.handleChainEnd(
      { messages: [{}], summarizationRequest: { reason: 'overflow' } },
      beforeSummary.agentNodeRunId,
    );
    expect(onAllowed).not.toHaveBeenCalled();

    const afterSummary = startRootModelAttempt(callback, 'agent-root', 'after-summary');
    callback.handleLLMEnd({}, afterSummary.modelRunId);
    callback.handleChainEnd({}, afterSummary.modelChainRunId);
    callback.handleChainEnd({ messages: [{}] }, afterSummary.agentNodeRunId);
    expect(onAllowed).toHaveBeenCalledTimes(1);
  });

  it('does not admit after a safe primary attempt when its fallback is policy-blocked', () => {
    let active = true;
    const onAllowed = jest.fn();
    const callback = createInitialModelBoundAdmissionCallback({
      agentIds: ['agent-root'],
      isActive: () => active,
      onAllowed,
    });

    const runs = startRootModelAttempt(callback, 'agent-root', 'fallback');
    callback.handleLLMEnd({}, runs.modelRunId);
    callback.handleChainError(
      new Error('Primary response failed validation'),
      runs.modelChainRunId,
    );
    expect(onAllowed).not.toHaveBeenCalled();

    /** The intrinsic model callback cancels persistence when the fallback's
     * exact payload is rejected before it can complete the agent node. */
    active = false;
    callback.handleChainError(new Error('Blocked fallback'), runs.agentNodeRunId);
    expect(onAllowed).not.toHaveBeenCalled();
  });
});
