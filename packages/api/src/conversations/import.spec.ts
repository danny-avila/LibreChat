import { RetentionMode } from 'librechat-data-provider';
import type { ConversationImportDependencies, ConversationImporter } from './import';
import {
  MAX_CONVERSATION_IMPORT_BSON_BYTES,
  MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES,
  ConversationImportError,
  assertConversationImportWriteSize,
  createConversationImportOperation,
  executeConversationImportWrites,
  isConversationImportError,
} from './import';
import {
  CONTENT_TRAVERSAL_MAX_DEPTH,
  CONTENT_TRAVERSAL_MAX_NODES,
} from '~/protection/adapters/nested';

interface TestBuilder {
  owner: string;
}

interface RecursiveMetadata {
  label?: string;
  nested?: RecursiveMetadata;
}

const baseExport = {
  conversationId: 'source-conversation',
  endpoint: 'openAI',
  title: 'Imported conversation',
  exportAt: '12:00:00 GMT+0000',
  branches: true,
  recursive: false,
  options: {
    endpoint: 'openAI',
    model: 'gpt-4o',
  },
  messages: [
    {
      messageId: 'source-message',
      conversationId: 'source-conversation',
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      sender: 'User',
      text: 'hello',
      isCreatedByUser: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function createDependencies(fileData: string, fileSize = Buffer.byteLength(fileData)) {
  const importer: jest.MockedFunction<ConversationImporter<TestBuilder>> = jest.fn(
    async (_jsonData, requestUserId, builderFactory) => {
      builderFactory(requestUserId);
    },
  );
  const cleanupError = jest.fn();
  const deps: ConversationImportDependencies<TestBuilder> = {
    statFile: jest.fn(async () => ({ size: fileSize })),
    readFile: jest.fn(async () => fileData),
    unlinkFile: jest.fn(async () => undefined),
    getImporter: jest.fn(() => importer),
    createBuilder: jest.fn((owner) => ({ owner })),
    maxFileSize: 1024 * 1024,
    onCleanupError: cleanupError,
  };
  return { deps, importer, cleanupError };
}

describe('createConversationImportOperation', () => {
  it.each([
    [
      'duplicate IDs',
      [
        ['same', null],
        ['same', null],
      ],
    ],
    ['missing parents', [['child', 'missing']]],
    [
      'cycles',
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    ],
    ['self references', [['a', 'a']]],
  ])('rejects flat graphs with %s before selecting an importer', async (_label, graph) => {
    const messages = graph.map(([messageId, parent]) => ({
      ...baseExport.messages[0],
      messageId,
      parentMessageId: parent ?? baseExport.messages[0].parentMessageId,
    }));
    const { deps } = createDependencies(JSON.stringify({ ...baseExport, messages }));
    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/invalid-graph.json',
        requestUserId: 'owner',
        format: 'librechat',
      }),
    ).rejects.toBeInstanceOf(ConversationImportError);
    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it.each(['messages', 'messagesTree'])(
    'validates message identities across the entire recursive %s tree',
    async (collection) => {
      const message = (messageId: string, children: object[] = []) => ({
        ...baseExport.messages[0],
        messageId,
        children,
      });
      const trees = [
        [message('root', [message('root')])],
        [message('root', [message('child'), message('child')])],
        [message('root-a', [message('shared')]), message('root-b', [message('shared')])],
        [message('')],
        [message(baseExport.messages[0].parentMessageId)],
      ];
      for (const tree of trees) {
        const { messages: _messages, ...conversation } = baseExport;
        const { deps } = createDependencies(
          JSON.stringify({ ...conversation, recursive: true, [collection]: tree }),
        );
        await expect(
          createConversationImportOperation(deps)({
            filepath: '/tmp/invalid-tree.json',
            requestUserId: 'owner',
            format: 'librechat',
          }),
        ).rejects.toBeInstanceOf(ConversationImportError);
        expect(deps.getImporter).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['true', 1, {}, null])(
    'rejects a non-boolean addedConvo marker: %j',
    async (addedConvo) => {
      const { deps } = createDependencies(
        JSON.stringify({
          ...baseExport,
          messages: [{ ...baseExport.messages[0], addedConvo }],
        }),
      );
      await expect(
        createConversationImportOperation(deps)({
          filepath: '/tmp/invalid-marker.json',
          requestUserId: 'owner',
          format: 'librechat',
        }),
      ).rejects.toBeInstanceOf(ConversationImportError);
      expect(deps.getImporter).not.toHaveBeenCalled();
    },
  );

  it.each([{ endpoint: 42 }, { title: {} }, { exportAt: null }])(
    'rejects invalid exported metadata: %j',
    async (metadata) => {
      const { deps } = createDependencies(JSON.stringify({ ...baseExport, ...metadata }));
      await expect(
        createConversationImportOperation(deps)({
          filepath: '/tmp/invalid-metadata.json',
          requestUserId: 'owner',
          format: 'librechat',
        }),
      ).rejects.toBeInstanceOf(ConversationImportError);
      expect(deps.getImporter).not.toHaveBeenCalled();
    },
  );

  it('runs a valid LibreChat export with the authenticated owner and import configuration', async () => {
    const { deps, importer } = createDependencies(JSON.stringify(baseExport));
    const operation = createConversationImportOperation(deps);
    const job = {
      filepath: '/tmp/conversation.json',
      requestUserId: 'authenticated-user',
      userRole: 'USER',
      interfaceConfig: { retentionMode: RetentionMode.ALL },
      filters: { messages: { unattributedAssistantContent: 'inspect' as const } },
    };

    await operation({ ...job, format: 'librechat' });

    expect(deps.createBuilder).toHaveBeenCalledWith(
      'authenticated-user',
      job.interfaceConfig,
      job.filters,
      undefined,
    );
    expect(importer).toHaveBeenCalledWith(
      baseExport,
      'authenticated-user',
      expect.any(Function),
      'USER',
    );
    expect(deps.unlinkFile).toHaveBeenCalledWith('/tmp/conversation.json');
  });

  it('rejects non-LibreChat formats before choosing an importer', async () => {
    const { deps } = createDependencies(JSON.stringify([{ mapping: {} }]));
    const operation = createConversationImportOperation(deps);

    await expect(
      operation({
        filepath: '/tmp/chatgpt.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toBeInstanceOf(ConversationImportError);

    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['conversation options', { options: { ...baseExport.options, owner: 'other-user' } }],
    ['message fields', { messages: [{ ...baseExport.messages[0], ownerId: 'other-user' }] }],
    [
      'nested message metadata',
      {
        messages: [
          {
            ...baseExport.messages[0],
            metadata: { attribution: { ownerId: 'other-user' } },
          },
        ],
      },
    ],
    [
      'nested message internal metadata',
      {
        messages: [
          {
            ...baseExport.messages[0],
            metadata: { source: { _id: '65f1ad8c90523874d2d409ef' } },
          },
        ],
      },
    ],
  ])('rejects caller-supplied ownership in %s', async (_location, changes) => {
    const { deps } = createDependencies(JSON.stringify({ ...baseExport, ...changes }));
    const operation = createConversationImportOperation(deps);

    await expect(
      operation({
        filepath: '/tmp/forged.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toBeInstanceOf(ConversationImportError);

    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it('removes normal source ownership and storage provenance before importing', async () => {
    const data = {
      ...baseExport,
      options: {
        ...baseExport.options,
        _id: '65f1ad8c90523874d2d409e0',
        __v: 91,
        conversationId: 'source-conversation',
        user: 'source-user',
        tenantId: 'source-tenant',
      },
      messages: [
        {
          ...baseExport.messages[0],
          _id: '65f1ad8c90523874d2d409e1',
          __v: 91,
          user: 'source-user',
          tenantId: 'source-tenant',
        },
      ],
    };
    const { deps, importer } = createDependencies(JSON.stringify(data));

    await createConversationImportOperation(deps)({
      filepath: '/tmp/source-provenance.json',
      requestUserId: 'authenticated-user',
      format: 'librechat',
    });

    const imported = importer.mock.calls[0][0];
    expect(imported).toMatchObject({
      options: baseExport.options,
      messages: [baseExport.messages[0]],
    });
    expect(imported).not.toEqual(data);
  });

  it.each([
    ['typed message values', { isCreatedByUser: 'true' }],
    ['created timestamp', { createdAt: 'not-a-date' }],
    ['updated timestamp', { updatedAt: 'still-not-a-date' }],
    ['content container', { content: { type: 'text', text: 'invalid container' } }],
    ['file container', { files: { file_id: 'invalid container' } }],
    ['tree depth', { depth: -1 }],
  ])('rejects an invalid %s before importer execution', async (_description, messageChanges) => {
    const data = {
      ...baseExport,
      messages: [{ ...baseExport.messages[0], ...messageChanges }],
    };
    const { deps } = createDependencies(JSON.stringify(data));

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/invalid-message.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['top-level title', { title: 42 }],
    ['top-level branch flag', { branches: 'yes' }],
    ['conversation option', { options: { ...baseExport.options, model: 42 } }],
    ['non-finite numeric option', { options: { ...baseExport.options, max_tokens: 'bogus' } }],
    [
      'non-recursive collection with descendants',
      {
        recursive: false,
        messages: [{ ...baseExport.messages[0], children: baseExport.messages }],
      },
    ],
    [
      'recursive flag for a nested collection',
      { recursive: false, messages: undefined, messagesTree: baseExport.messages },
    ],
  ])('rejects an invalid %s value before importer execution', async (_description, changes) => {
    const { deps } = createDependencies(JSON.stringify({ ...baseExport, ...changes }));

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/invalid-conversation.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
    expect(deps.getImporter).not.toHaveBeenCalled();
  });

  it('normalizes supported numeric string options before importer execution', async () => {
    const { deps, importer } = createDependencies(
      JSON.stringify({
        ...baseExport,
        options: { ...baseExport.options, max_tokens: '2048' },
      }),
    );

    await createConversationImportOperation(deps)({
      filepath: '/tmp/numeric-option.json',
      requestUserId: 'authenticated-user',
      format: 'librechat',
    });

    expect(importer).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ max_tokens: 2048 }),
      }),
      'authenticated-user',
      expect.any(Function),
      undefined,
    );
  });

  it('rejects an empty recursive parent whose descendants would be skipped', async () => {
    const data = {
      ...baseExport,
      recursive: true,
      messages: undefined,
      messagesTree: [
        {
          ...baseExport.messages[0],
          text: '',
          children: [{ ...baseExport.messages[0], messageId: 'child-message' }],
        },
      ],
    };
    const { deps } = createDependencies(JSON.stringify(data));

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/empty-recursive-parent.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
    expect(deps.getImporter).not.toHaveBeenCalled();
  });

  it.each(['parts', 'annotations', 'outputs', 'results'])(
    'bounds nested %s before schema parsing',
    async (variant) => {
      const entries = Array.from({ length: CONTENT_TRAVERSAL_MAX_NODES + 1 }, () => ({
        type: 'text',
        text: 'entry',
      }));
      let content: unknown[];
      if (variant === 'parts') {
        content = entries;
      } else if (variant === 'annotations') {
        content = [
          {
            type: 'text',
            text: {
              value: 'text',
              annotations: entries.map(() => ({
                type: 'file_path',
                text: 'file',
                start_index: 0,
                end_index: 1,
                file_path: { file_id: 'file' },
              })),
            },
          },
        ];
      } else {
        const tool_call =
          variant === 'outputs'
            ? {
                type: 'code_interpreter',
                code_interpreter: {
                  input: 'code',
                  outputs: entries.map(() => ({ type: 'logs', logs: 'output' })),
                },
              }
            : {
                type: 'file_search',
                file_search: {
                  results: entries.map(() => ({ file_id: 'file', file_name: 'name', score: 1 })),
                },
              };
        content = [{ type: 'tool_call', tool_call }];
      }
      const { deps } = createDependencies(
        JSON.stringify({ ...baseExport, messages: [{ ...baseExport.messages[0], content }] }),
      );
      await expect(
        createConversationImportOperation(deps)({
          filepath: '/tmp/bounded.json',
          requestUserId: 'owner',
          format: 'librechat',
        }),
      ).rejects.toThrow('structure exceeds import limits');
      expect(deps.getImporter).not.toHaveBeenCalled();
      expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'discards imported provider thread state (recursive=%s)',
    async (recursive) => {
      const message = { ...baseExport.messages[0], thread_id: 'source-thread' };
      const { messages: _messages, ...conversation } = baseExport;
      const { deps, importer } = createDependencies(
        JSON.stringify({
          ...conversation,
          recursive,
          ...(recursive
            ? { messagesTree: [{ ...message, children: [{ ...message, messageId: 'child' }] }] }
            : { messages: [message] }),
        }),
      );
      await createConversationImportOperation(deps)({
        filepath: '/tmp/transcript.json',
        requestUserId: 'owner',
        format: 'librechat',
      });
      const normalized = JSON.stringify(importer.mock.calls[0][0]);
      expect(normalized).not.toContain('thread_id');
      expect(normalized).toContain('hello');
    },
  );

  it('strips provider file IDs from options before any importer or policy runs', async () => {
    const { deps, importer } = createDependencies(
      JSON.stringify({
        ...baseExport,
        options: { ...baseExport.options, file_ids: ['provider-file-reference'] },
      }),
    );
    await createConversationImportOperation(deps)({
      filepath: '/tmp/provider-options.json',
      requestUserId: 'owner',
      format: 'librechat',
    });
    expect(importer.mock.calls[0][0]).toMatchObject({ options: baseExport.options });
    expect(importer.mock.calls[0][0]).not.toHaveProperty('options.file_ids');
  });

  it.each([
    {
      type: 'web_search',
      web_search: { references: [{ link: 'https://example.com', type: 'link' }] },
    },
    {
      type: 'file_search',
      file_search: { references: [{ link: 'file-reference', type: 'file' }] },
    },
    { type: 'memory', memory: { key: 'preference', type: 'delete' } },
    { type: 'ui_resources', ui_resources: [{ resourceId: 'resource', uri: 'ui://resource' }] },
  ])(
    'accepts supported non-file attachment $type and rejects malformed variants',
    async (attachment) => {
      for (const valid of [true, false]) {
        const entry = valid ? attachment : { type: attachment.type, [attachment.type]: 'invalid' };
        const { deps, importer } = createDependencies(
          JSON.stringify({
            ...baseExport,
            messages: [{ ...baseExport.messages[0], attachments: [entry] }],
          }),
        );
        const operation = createConversationImportOperation(deps)({
          filepath: '/tmp/artifact.json',
          requestUserId: 'owner',
          format: 'librechat',
        });
        if (valid) {
          await operation;
          expect(importer).toHaveBeenCalled();
        } else {
          await expect(operation).rejects.toThrow('not a supported file object');
          expect(importer).not.toHaveBeenCalled();
        }
      }
    },
  );

  describe.each(['files', 'attachments'])('imported %s', (field) => {
    it.each([null, false, 1, 'file', [], { filename: {} }, { filepath: 4 }, { text: [] }])(
      'rejects malformed entry %j in flat and recursive exports',
      async (entry) => {
        for (const recursive of [false, true]) {
          const { deps } = createDependencies(
            JSON.stringify({
              ...baseExport,
              recursive,
              messages: [{ ...baseExport.messages[0], [field]: [entry] }],
            }),
          );
          await expect(
            createConversationImportOperation(deps)({
              filepath: '/tmp/malformed-file.json',
              requestUserId: 'authenticated-user',
              format: 'librechat',
            }),
          ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
          expect(deps.getImporter).not.toHaveBeenCalled();
          expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
        }
      },
    );

    it('preserves partial references and complete render fields', async () => {
      const entries = [
        { file_id: 'reference' },
        {
          filename: 'example.txt',
          filepath: '/files/example.txt',
          type: 'text/plain',
          text: 'contents',
          bytes: 8,
          embedded: false,
          messageId: 'source-message',
          toolCallId: 'call',
          metadata: { fileIdentifier: 'reference' },
        },
      ];
      const { deps, importer } = createDependencies(
        JSON.stringify({
          ...baseExport,
          messages: [{ ...baseExport.messages[0], [field]: entries }],
        }),
      );
      await createConversationImportOperation(deps)({
        filepath: '/tmp/files.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      });
      expect(importer.mock.calls[0][0]).toMatchObject({ messages: [{ [field]: entries }] });
    });
  });

  it('strips source retention and attachment ownership before importer execution', async () => {
    const { deps, importer } = createDependencies(
      JSON.stringify({
        ...baseExport,
        messages: [
          {
            ...baseExport.messages[0],
            isTemporary: true,
            expiredAt: '2020-01-01T00:00:00.000Z',
            attachments: [{ file_id: 'file-a', user: 'source-user', tenantId: 'source-tenant' }],
          },
        ],
      }),
    );
    await createConversationImportOperation(deps)({
      filepath: '/tmp/source-policy.json',
      requestUserId: 'destination-user',
      format: 'librechat',
    });
    expect(importer.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        messages: [{ ...baseExport.messages[0], attachments: [{ file_id: 'file-a' }] }],
      }),
    );
  });

  it('strips exported file ownership before canonical file resolution', async () => {
    const data = {
      ...baseExport,
      messages: [
        {
          ...baseExport.messages[0],
          files: [
            {
              file_id: 'owner-file-1',
              user: 'source-owner',
              tenantId: 'source-tenant',
              metadata: { ownerId: 'source-owner' },
            },
          ],
        },
      ],
    };
    const { deps, importer } = createDependencies(JSON.stringify(data));

    await createConversationImportOperation(deps)({
      filepath: '/tmp/exported-file.json',
      requestUserId: 'authenticated-user',
      format: 'librechat',
    });

    expect(importer.mock.calls[0][0]).toMatchObject({
      messages: [{ files: [{ file_id: 'owner-file-1', metadata: {} }] }],
    });
  });

  it.each([null, 'file', { type: 42 }])(
    'rejects invalid nested steer attachment %j before persistence',
    async (file) => {
      const { deps } = createDependencies(
        JSON.stringify({
          ...baseExport,
          messages: [
            {
              ...baseExport.messages[0],
              content: [
                {
                  type: 'tool_call',
                  tool_call: {
                    name: 'subagent',
                    subagent_content: [{ type: 'steer', steer: 'Use this', files: [file] }],
                  },
                },
              ],
            },
          ],
        }),
      );
      await expect(
        createConversationImportOperation(deps)({
          filepath: '/tmp/steer.json',
          requestUserId: 'owner',
          format: 'librechat',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(deps.getImporter).not.toHaveBeenCalled();
      expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects an imported title beyond the management title limit', async () => {
    const { deps } = createDependencies(JSON.stringify({ ...baseExport, title: 'x'.repeat(1025) }));

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/oversized-title.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request', statusCode: 400 });
    expect(deps.getImporter).not.toHaveBeenCalled();
  });

  it('requires bookmark access before importing tags', async () => {
    const taggedExport = {
      ...baseExport,
      options: { ...baseExport.options, tags: ['restricted'] },
    };
    const denied = createDependencies(JSON.stringify(taggedExport));

    await expect(
      createConversationImportOperation(denied.deps)({
        filepath: '/tmp/tagged.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' });
    expect(denied.deps.getImporter).not.toHaveBeenCalled();
    expect(denied.deps.unlinkFile).toHaveBeenCalledTimes(1);

    const allowed = createDependencies(JSON.stringify(taggedExport));
    await createConversationImportOperation(allowed.deps)({
      filepath: '/tmp/tagged.json',
      requestUserId: 'authenticated-user',
      format: 'librechat',
      allowTags: true,
    });
    expect(allowed.importer).toHaveBeenCalledTimes(1);
  });

  it.each([
    { tags: Array.from({ length: 101 }, (_, i) => `tag-${i}`) },
    { tags: ['x'.repeat(257)] },
  ])('rejects import tag cardinality and length beyond PATCH limits', async ({ tags }) => {
    const { deps } = createDependencies(
      JSON.stringify({ ...baseExport, options: { ...baseExport.options, tags } }),
    );
    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/tags.json',
        requestUserId: 'user',
        format: 'librechat',
        allowTags: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(deps.getImporter).not.toHaveBeenCalled();
  });

  it('normalizes and deduplicates valid import tags with the PATCH schema', async () => {
    const { deps, importer } = createDependencies(
      JSON.stringify({
        ...baseExport,
        options: { ...baseExport.options, tags: [' one ', 'one', 'x'.repeat(256)] },
      }),
    );
    await createConversationImportOperation(deps)({
      filepath: '/tmp/tags.json',
      requestUserId: 'user',
      format: 'librechat',
      allowTags: true,
    });
    expect(importer.mock.calls[0][0]).toMatchObject({
      options: { tags: ['one', 'x'.repeat(256)] },
    });
  });

  it.each([
    { type: 'text', text: 7 },
    { type: 'image_url', image_url: { url: 7 } },
    { type: 'tool_call', tool_call: { args: 7 } },
    { type: 'agent_update', agent_update: { index: 'bad', runId: 'run', agentId: 'agent' } },
    { type: 'unsupported', text: 'ignored' },
    null,
  ])('rejects malformed content parts before selecting an importer: %j', async (part) => {
    const { deps } = createDependencies(
      JSON.stringify({
        ...baseExport,
        messages: [{ ...baseExport.messages[0], content: [part] }],
      }),
    );
    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/content.json',
        requestUserId: 'user',
        format: 'librechat',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it('preserves supported multimodal content without rewriting its payload', async () => {
    const content = [
      { type: 'text', text: { value: 'Hello' } },
      { type: 'agent_update', agent_update: { index: 0, runId: 'run-1', agentId: 'agent-1' } },
      { type: 'image_url', image_url: { url: 'https://example.com/image.png', detail: 'high' } },
      { type: 'input_audio', input_audio: { data: 'YXVkaW8=', format: 'wav' } },
      {
        type: 'tool_call',
        tool_call: { name: 'draft', args: { tenantId: 'example', nested: [1, 2] } },
      },
    ];
    const { deps, importer } = createDependencies(
      JSON.stringify({
        ...baseExport,
        messages: [{ ...baseExport.messages[0], content }],
      }),
    );
    await createConversationImportOperation(deps)({
      filepath: '/tmp/content.json',
      requestUserId: 'user',
      format: 'librechat',
    });
    expect(importer.mock.calls[0][0]).toMatchObject({ messages: [{ content }] });
  });

  it('keeps ownership-shaped keys inside user-authored tool arguments opaque', async () => {
    const data = {
      ...baseExport,
      messages: [
        {
          ...baseExport.messages[0],
          content: [
            {
              type: 'tool_call',
              tool_call: {
                name: 'draft_payload',
                args: { user: 'example', tenantId: 'example', owner: 'example' },
              },
            },
          ],
        },
      ],
    };
    const { deps, importer } = createDependencies(JSON.stringify(data));

    await createConversationImportOperation(deps)({
      filepath: '/tmp/tool-args.json',
      requestUserId: 'authenticated-user',
      format: 'librechat',
    });

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('rejects message metadata beyond the shared traversal depth limit', async () => {
    let metadata: RecursiveMetadata = { label: 'leaf' };
    for (let depth = 0; depth <= CONTENT_TRAVERSAL_MAX_DEPTH; depth++) {
      metadata = { nested: metadata };
    }
    const data = {
      ...baseExport,
      messages: [{ ...baseExport.messages[0], metadata }],
    };
    const { deps } = createDependencies(JSON.stringify(data));

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/deep-metadata.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toBeInstanceOf(ConversationImportError);

    expect(deps.getImporter).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it('propagates policy rejection and still removes the upload', async () => {
    const policyError = Object.assign(new Error('blocked'), { code: 'content_filter_block' });
    const { deps, importer } = createDependencies(JSON.stringify(baseExport));
    importer.mockRejectedValue(policyError);

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/policy.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toBe(policyError);

    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it('enforces the configured size limit before reading and removes the upload', async () => {
    const { deps } = createDependencies(JSON.stringify(baseExport), 1025);
    deps.maxFileSize = 1024;

    await expect(
      createConversationImportOperation(deps)({
        filepath: '/tmp/large.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      }),
    ).rejects.toBeInstanceOf(ConversationImportError);

    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.unlinkFile).toHaveBeenCalledTimes(1);
  });

  it('reports a failed cleanup without replacing the import error', async () => {
    const { deps, cleanupError } = createDependencies('{');
    const unlinkError = new Error('unlink failed');
    jest.mocked(deps.unlinkFile).mockRejectedValue(unlinkError);

    let thrown: object | undefined;
    try {
      await createConversationImportOperation(deps)({
        filepath: '/tmp/invalid.json',
        requestUserId: 'authenticated-user',
        format: 'librechat',
      });
    } catch (error) {
      if (error instanceof Error) thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(isConversationImportError(thrown!)).toBe(true);
    expect(cleanupError).toHaveBeenCalledWith(
      unlinkError,
      '/tmp/invalid.json',
      'authenticated-user',
    );
  });

  it('retains legacy format selection and legacy error types when strict mode is omitted', async () => {
    const { deps, importer } = createDependencies(JSON.stringify([{ mapping: {} }]));

    await createConversationImportOperation(deps)({
      filepath: '/tmp/legacy.json',
      requestUserId: 'authenticated-user',
    });

    expect(importer).toHaveBeenCalledTimes(1);

    const invalid = createDependencies('{');
    await expect(
      createConversationImportOperation(invalid.deps)({
        filepath: '/tmp/legacy-invalid.json',
        requestUserId: 'authenticated-user',
      }),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe('conversation import writes', () => {
  it('preserves both published error constructor forms', () => {
    const cause = new Error('source failure');
    const numeric = new ConversationImportError('oversized', 413, { cause });
    const options = new ConversationImportError('oversized', { statusCode: 413, cause });
    const defaults = new ConversationImportError('invalid');
    const denied = new ConversationImportError('denied', { code: 'permission_denied' });

    expect(numeric).toMatchObject({ code: 'invalid_request', statusCode: 413, cause });
    expect(options).toMatchObject({ code: 'invalid_request', statusCode: 413, cause });
    expect(defaults).toMatchObject({ code: 'invalid_request', statusCode: 400 });
    expect(denied).toMatchObject({ code: 'permission_denied', statusCode: 403 });
  });

  it('rejects a document too close to the MongoDB BSON limit before writes begin', () => {
    let thrown: Error | undefined;
    try {
      assertConversationImportWriteSize({
        conversations: [
          {
            user: 'authenticated-user',
            conversationId: 'generated-conversation',
            title: 'x'.repeat(MAX_CONVERSATION_IMPORT_BSON_BYTES),
          },
        ],
        messages: [],
        tenantId: 'tenant-a',
      });
    } catch (error) {
      if (error instanceof Error) {
        thrown = error;
      }
    }
    expect(thrown).toBeInstanceOf(ConversationImportError);
    expect(thrown).toMatchObject({
      code: 'invalid_request',
      statusCode: 413,
      message: `Each imported conversation or message must be at most ${MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES} bytes`,
      body: {
        error: 'invalid_request',
        message: `Each imported conversation or message must be at most ${MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES} bytes`,
      },
    });
    expect(isConversationImportError(thrown)).toBe(true);

    expect(() =>
      assertConversationImportWriteSize({
        conversations: [{ conversationId: 'generated-conversation', title: 'Imported' }],
        messages: [{ conversationId: 'generated-conversation', text: 'Hello' }],
      }),
    ).not.toThrow();
  });

  it('compensates a partial conversation write before rethrowing its error', async () => {
    const order: string[] = [];
    const writeError = new Error('conversation write failed');

    await expect(
      executeConversationImportWrites({
        saveConversations: jest.fn(async () => {
          order.push('save conversations');
          throw writeError;
        }),
        saveMessages: jest.fn(async () => {
          order.push('save messages');
        }),
        updateTagCounts: jest.fn(async () => {
          order.push('update tags');
        }),
        deleteMessages: jest.fn(async () => {
          order.push('delete messages');
        }),
        deleteConversations: jest.fn(async () => {
          order.push('delete conversations');
        }),
      }),
    ).rejects.toBe(writeError);

    expect(order).toEqual(['save conversations', 'delete messages', 'delete conversations']);
  });

  it('compensates partial messages before removing their conversation', async () => {
    const order: string[] = [];
    const writeError = new Error('message write failed');

    await expect(
      executeConversationImportWrites({
        saveConversations: jest.fn(async () => {
          order.push('save conversations');
        }),
        saveMessages: jest.fn(async () => {
          order.push('save messages');
          throw writeError;
        }),
        updateTagCounts: jest.fn(async () => {
          order.push('update tags');
        }),
        deleteMessages: jest.fn(async () => {
          order.push('delete messages');
        }),
        deleteConversations: jest.fn(async () => {
          order.push('delete conversations');
        }),
      }),
    ).rejects.toBe(writeError);

    expect(order).toEqual([
      'save conversations',
      'save messages',
      'delete messages',
      'delete conversations',
    ]);
  });

  it('keeps the conversation discoverable when message cleanup fails', async () => {
    const writeError = new Error('message write failed');
    const cleanupError = new Error('message cleanup failed');
    const deleteConversations = jest.fn().mockResolvedValue(undefined);
    const onCleanupError = jest.fn();

    await expect(
      executeConversationImportWrites({
        saveConversations: jest.fn().mockResolvedValue(undefined),
        saveMessages: jest.fn().mockRejectedValue(writeError),
        updateTagCounts: jest.fn().mockResolvedValue(undefined),
        deleteMessages: jest.fn().mockRejectedValue(cleanupError),
        deleteConversations,
        onCleanupError,
      }),
    ).rejects.toBe(writeError);

    expect(deleteConversations).not.toHaveBeenCalled();
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, 'messages');
  });

  it('reports failed conversation cleanup without replacing the write error', async () => {
    const writeError = new Error('message write failed');
    const cleanupError = new Error('conversation cleanup failed');
    const onCleanupError = jest.fn();

    await expect(
      executeConversationImportWrites({
        saveConversations: jest.fn().mockResolvedValue(undefined),
        saveMessages: jest.fn().mockRejectedValue(writeError),
        updateTagCounts: jest.fn().mockResolvedValue(undefined),
        deleteMessages: jest.fn().mockResolvedValue(undefined),
        deleteConversations: jest.fn().mockRejectedValue(cleanupError),
        onCleanupError,
      }),
    ).rejects.toBe(writeError);

    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, 'conversations');
  });

  it('keeps the completed import when derived tag count refresh fails', async () => {
    const tagError = new Error('tag count failed');
    const onTagCountError = jest.fn();
    const deleteMessages = jest.fn().mockResolvedValue(undefined);
    const deleteConversations = jest.fn().mockResolvedValue(undefined);

    await expect(
      executeConversationImportWrites({
        saveConversations: jest.fn().mockResolvedValue(undefined),
        saveMessages: jest.fn().mockResolvedValue(undefined),
        updateTagCounts: jest.fn().mockRejectedValue(tagError),
        deleteMessages,
        deleteConversations,
        onTagCountError,
      }),
    ).resolves.toBeUndefined();

    expect(deleteMessages).not.toHaveBeenCalled();
    expect(deleteConversations).not.toHaveBeenCalled();
    expect(onTagCountError).toHaveBeenCalledWith(tagError);
  });
});
