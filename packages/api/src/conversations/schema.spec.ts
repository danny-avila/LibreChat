import { Types } from 'mongoose';
import { ContentTypes } from 'librechat-data-provider';
import type { ConversationMessageResource } from '@librechat/data-schemas';
import {
  ConversationManagementError,
  conversationListSchema,
  conversationUpdateSchema,
  decodeConversationCursor,
  encodeConversationCursor,
  projectConversationMessage,
  isValidConversationContentPart,
} from './schema';

describe('conversation management request schemas', () => {
  it('applies page limits and strict update validation', () => {
    expect(conversationListSchema.parse({})).toEqual({ limit: 20 });
    expect(conversationListSchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(() => conversationListSchema.parse({ limit: '101' })).toThrow();
    expect(() => conversationListSchema.parse({ unknown: 'field' })).toThrow();
    expect(() => conversationUpdateSchema.parse({})).toThrow();
    expect(() => conversationUpdateSchema.parse({ title: '   ' })).toThrow();
    expect(() => conversationUpdateSchema.parse({ title: 'ok', unknown: true })).toThrow();
  });

  it('normalizes tags and supports an explicit archive filter without defaulting it', () => {
    expect(
      conversationListSchema.parse({ tags: ['beta', 'alpha', 'beta'], isArchived: 'false' }),
    ).toEqual({ limit: 20, tags: ['alpha', 'beta'], isArchived: false });
    expect(conversationListSchema.parse({})).not.toHaveProperty('isArchived');
    expect(conversationUpdateSchema.parse({ tags: [' one ', 'one', 'two'] })).toEqual({
      tags: ['one', 'two'],
    });
  });
});

describe('conversation management cursors', () => {
  const boundary = {
    date: '2026-09-06T12:34:56.789Z',
    id: new Types.ObjectId().toHexString(),
  };

  it('round-trips only within the bound resource and filter scope', () => {
    const cursor = encodeConversationCursor('conversations', boundary, 'owner/tenant/filter-a');

    expect(decodeConversationCursor(cursor, 'conversations', 'owner/tenant/filter-a')).toEqual(
      boundary,
    );
    expect(() => decodeConversationCursor(cursor, 'messages', 'owner/tenant/filter-a')).toThrow(
      ConversationManagementError,
    );
    expect(() =>
      decodeConversationCursor(cursor, 'conversations', 'owner/tenant/filter-b'),
    ).toThrow(ConversationManagementError);
  });

  it.each([
    ['non-base64url', '%%%'],
    ['invalid JSON', Buffer.from('{').toString('base64url')],
    [
      'invalid identifier',
      Buffer.from(
        JSON.stringify({
          v: 1,
          kind: 'conversations',
          date: boundary.date,
          id: 'not-an-object-id',
          scope: '0'.repeat(64),
        }),
      ).toString('base64url'),
    ],
  ])('rejects a %s cursor before it reaches Mongo', (_label, cursor) => {
    expect(() => decodeConversationCursor(cursor, 'conversations', 'scope')).toThrow(
      ConversationManagementError,
    );
  });
});

describe('conversation message projection', () => {
  it('preserves public text annotations and strips unknown annotation properties', () => {
    const annotations = [
      {
        type: 'file_citation',
        start_index: 0,
        end_index: 3,
        text: 'ref',
        file_citation: { file_id: 'citation', quote: 'quoted text' },
      },
      {
        type: 'file_path',
        start_index: 4,
        end_index: 8,
        text: 'file',
        file_path: { file_id: 'generated' },
      },
    ];
    const source = {
      messageId: 'message',
      conversationId: 'conversation',
      text: 'ref file',
      content: [
        {
          type: ContentTypes.TEXT,
          text: {
            value: 'ref file',
            storageKey: 'private',
            annotations: annotations.map((annotation) => ({
              ...annotation,
              credentials: 'private',
              ...(annotation.file_path
                ? { file_path: { ...annotation.file_path, storageKey: 'private' } }
                : {}),
            })),
          },
        },
      ],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source).content).toEqual([
      { type: ContentTypes.TEXT, text: { value: 'ref file', annotations } },
    ]);
  });

  it.each([
    { id: 'partial-code', type: 'code_interpreter' },
    { id: 'partial-search', type: 'file_search' },
    { id: 'partial-retrieval', type: 'retrieval' },
    {
      id: 'code',
      type: 'code_interpreter',
      code_interpreter: {
        input: 'print(1)',
        outputs: [
          { type: 'logs', logs: '1' },
          { type: 'image', image: { file_id: 'image' } },
        ],
      },
    },
    { id: 'retrieval', type: 'retrieval', retrieval: {} },
    {
      id: 'search',
      type: 'file_search',
      file_search: {
        ranking_options: { ranker: 'auto', score_threshold: 0.2 },
        results: [
          {
            file_id: 'file',
            file_name: 'notes.txt',
            score: 0.9,
            content: [{ type: 'text', text: 'excerpt' }],
          },
        ],
      },
    },
    {
      id: 'pending-function',
      type: 'function',
      function: { name: 'lookup', arguments: '{}', output: null },
    },
  ])('preserves the public payload of $type tool calls', (tool_call) => {
    const content = { type: ContentTypes.TOOL_CALL, tool_call };
    expect(isValidConversationContentPart(content)).toBe(true);
    const source = {
      messageId: 'message',
      conversationId: 'conversation',
      content: [{ ...content, tool_call: { ...tool_call, credentials: 'private' } }],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source).content).toEqual([content]);
  });

  it('strips internal code-output fields and rejects malformed known tool variants', () => {
    const source = {
      messageId: 'message',
      conversationId: 'conversation',
      content: [
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: {
            type: 'code_interpreter',
            code_interpreter: {
              input: 'code',
              storageKey: 'private',
              outputs: [{ type: 'image', image: { file_id: 'image', storageKey: 'private' } }],
            },
          },
        },
      ],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source).content).toEqual([
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          type: 'code_interpreter',
          code_interpreter: {
            input: 'code',
            outputs: [{ type: 'image', image: { file_id: 'image' } }],
          },
        },
      },
    ]);
    for (const tool_call of [
      { type: 'code_interpreter', code_interpreter: { input: [] } },
      { type: 'code_interpreter', code_interpreter: { outputs: [null] } },
      { type: 'retrieval', retrieval: null },
      { type: 'file_search', file_search: { results: 'invalid' } },
    ])
      expect(isValidConversationContentPart({ type: ContentTypes.TOOL_CALL, tool_call })).toBe(
        false,
      );
  });

  it('preserves complete public summary metadata and tool host identity', () => {
    const summary = {
      type: ContentTypes.SUMMARY,
      content: [{ type: ContentTypes.TEXT, text: 'summary' }],
      tokenCount: 42,
      model: 'model',
      provider: 'provider',
      initiatedBy: 'user',
      summaryVersion: 2,
      createdAt: '2026-09-08T00:00:00Z',
      summarizing: false,
      failed: false,
      boundary: { messageId: 'boundary-message', contentIndex: 3 },
    };
    const tool = {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'call',
        name: 'lookup',
        stepId: 'host-step',
        mcpServerName: 'server',
        args: '{}',
        output: 'result',
      },
    };
    const source = {
      messageId: 'message',
      conversationId: 'conversation',
      content: [
        { ...summary, boundary: { ...summary.boundary, credentials: 'private' } },
        { ...tool, tool_call: { ...tool.tool_call, auth: 'private' } },
      ],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source).content).toEqual([summary, tool]);
  });

  it('keeps supported visible content variants and strips stored internal fields', () => {
    const source = {
      _id: new Types.ObjectId(),
      messageId: 'message-1',
      conversationId: 'conversation-1',
      parentMessageId: 'parent-1',
      text: 'Visible message',
      sender: 'assistant',
      isCreatedByUser: false,
      createdAt: new Date('2026-09-06T12:00:00.000Z'),
      updatedAt: new Date('2026-09-06T12:00:01.000Z'),
      content: [
        {
          type: ContentTypes.AGENT_UPDATE,
          agent_update: {
            index: 0,
            runId: 'run-1',
            agentId: 'agent-1',
            credentials: 'must-not-leak',
          },
        },
        {
          type: ContentTypes.TEXT,
          text: 'hello',
          tenantId: 'must-not-leak',
          storageKey: 'must-not-leak',
        },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: {
            id: 'call-1',
            name: 'weather',
            args: { city: 'Paris' },
            output: [{ temperature: 20 }],
            credentials: { token: 'must-not-leak' },
          },
          providerCredential: 'must-not-leak',
        },
        {
          type: ContentTypes.IMAGE_URL,
          image_url: { url: 'https://example.test/image.png', detail: 'high' },
          bucket: 'must-not-leak',
        },
        {
          type: ContentTypes.VIDEO_URL,
          video_url: { url: 'https://example.test/video.mp4', storage: 'must-not-leak' },
        },
        {
          type: ContentTypes.INPUT_AUDIO,
          input_audio: { data: 'audio-data', format: 'wav', apiKey: 'must-not-leak' },
        },
        {
          type: ContentTypes.AGENT_UPDATE,
          agent_update: { credentials: 'must-not-leak' },
        },
        { type: 'unknown', credentials: 'must-not-leak' },
      ],
      user: 'must-not-leak',
      tenantId: 'must-not-leak',
      endpoint: 'openAI',
      credentials: { token: 'must-not-leak' },
    } as unknown as ConversationMessageResource;

    const result = projectConversationMessage(source);

    expect(result).toMatchObject({
      id: 'message-1',
      conversationId: 'conversation-1',
      parentMessageId: 'parent-1',
      text: 'Visible message',
      sender: 'assistant',
      isCreatedByUser: false,
      createdAt: '2026-09-06T12:00:00.000Z',
      updatedAt: '2026-09-06T12:00:01.000Z',
    });
    expect(result.content).toEqual([
      {
        type: ContentTypes.AGENT_UPDATE,
        agent_update: { index: 0, runId: 'run-1', agentId: 'agent-1' },
      },
      { type: ContentTypes.TEXT, text: 'hello' },
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: 'call-1',
          name: 'weather',
          args: { city: 'Paris' },
          output: [{ temperature: 20 }],
        },
      },
      {
        type: ContentTypes.IMAGE_URL,
        image_url: { url: 'https://example.test/image.png', detail: 'high' },
      },
      {
        type: ContentTypes.VIDEO_URL,
        video_url: { url: 'https://example.test/video.mp4' },
      },
      {
        type: ContentTypes.INPUT_AUDIO,
        input_audio: { data: 'audio-data', format: 'wav' },
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /must-not-leak|tenantId|storageKey|providerCredential|credentials|apiKey/,
    );
  });
});

describe('nested public content', () => {
  it('preserves recursive subagent transcripts and strips private fields at each level', () => {
    const leaf = {
      type: 'steer',
      steer: 'Use this',
      files: [{ file_id: 'file', type: 'text/plain', filename: 'notes', user: 'private' }],
    };
    const part = {
      type: 'tool_call',
      tool_call: {
        name: 'subagent',
        auth: 'private',
        subagent_content: [
          { type: 'think', think: 'Child reasoning' },
          { type: 'tool_call', tool_call: { name: 'subagent', subagent_content: [leaf] } },
        ],
      },
    };
    expect(isValidConversationContentPart(part)).toBe(true);
    const projected = projectConversationMessage({
      content: [part],
    } as ConversationMessageResource).content;
    expect(projected).toEqual([
      {
        type: 'tool_call',
        tool_call: {
          name: 'subagent',
          subagent_content: [
            { type: 'think', think: 'Child reasoning' },
            {
              type: 'tool_call',
              tool_call: {
                name: 'subagent',
                subagent_content: [
                  {
                    type: 'steer',
                    steer: 'Use this',
                    files: [{ file_id: 'file', type: 'text/plain', filename: 'notes' }],
                  },
                ],
              },
            },
          ],
        },
      },
    ]);
  });

  it.each([[null], ['file'], [{ type: 42 }], [{ bytes: 'large' }]])(
    'rejects malformed steer files %j',
    (...files) => {
      expect(isValidConversationContentPart({ type: 'steer', steer: 'Use this', files })).toBe(
        false,
      );
    },
  );

  it('bounds recursive content before parsing', () => {
    let part: unknown = { type: 'text', text: 'leaf' };
    for (let i = 0; i < 30; i++)
      part = { type: 'tool_call', tool_call: { subagent_content: [part] } };
    expect(isValidConversationContentPart(part)).toBe(false);
    expect(
      projectConversationMessage({ content: [part] } as ConversationMessageResource).content,
    ).toEqual([]);
  });
});

describe('persisted failure markers', () => {
  it.each([true, false])('preserves input validation marker %s', (inputValidationError) => {
    const content = [{ type: 'tool_call', tool_call: { name: 'ask_user', inputValidationError } }];
    expect(projectConversationMessage({ content } as ConversationMessageResource).content).toEqual(
      content,
    );
  });
  it('rejects malformed input validation markers', () => {
    expect(
      isValidConversationContentPart({
        type: 'tool_call',
        tool_call: { inputValidationError: 'true' },
      }),
    ).toBe(false);
  });
  it.each(['ok', 'partial', 'failed'])('preserves existing activity status %s', (status) => {
    const content = [{ type: 'activity_label', activity_label: 'Tools finished', status }];
    expect(projectConversationMessage({ content } as ConversationMessageResource).content).toEqual(
      content,
    );
  });
});

describe('message attachment projection', () => {
  it('sanitizes file references and ignores malformed entries', () => {
    const source = {
      files: [
        null,
        'invalid',
        {
          file_id: 'upload',
          filename: 'notes.txt',
          type: 'text/plain',
          bytes: 12,
          user: 'private',
          tenantId: 'private',
          storageKey: 'private',
          metadata: { credentials: 'private' },
        },
      ],
      attachments: [
        { file_id: 'artifact', filepath: '/files/artifact', toolCallId: 'tool', auth: 'private' },
        { bytes: 'invalid' },
      ],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source)).toMatchObject({
      files: [
        { file_id: 'upload', filename: 'notes.txt', type: 'text/plain', bytes: 12, metadata: {} },
      ],
      attachments: [{ file_id: 'artifact', filepath: '/files/artifact', toolCallId: 'tool' }],
    });
    expect(projectConversationMessage({} as ConversationMessageResource)).toMatchObject({
      files: [],
      attachments: [],
    });
  });
  it('bounds nested file references before parsing', () => {
    let nested: unknown = {};
    for (let i = 0; i < 30; i++) nested = { nested };
    const source = {
      files: [{ file_id: 'deep', metadata: nested }],
      attachments: [{ file_id: 'valid' }],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source)).toMatchObject({
      files: [],
      attachments: [{ file_id: 'valid' }],
    });
  });
});

describe('quoted message context', () => {
  it('preserves only quoted strings and defaults absent or invalid arrays to empty', () => {
    expect(
      projectConversationMessage({
        quotes: ['first', 12, null, 'second'],
      } as unknown as ConversationMessageResource).quotes,
    ).toEqual(['first', 'second']);
    expect(projectConversationMessage({} as ConversationMessageResource).quotes).toEqual([]);
    expect(
      projectConversationMessage({ quotes: 'invalid' } as unknown as ConversationMessageResource)
        .quotes,
    ).toEqual([]);
  });
});

describe('public approval and skill context', () => {
  it('preserves the approval contract while stripping private fields', () => {
    const source = {
      content: [
        {
          type: 'tool_call',
          tool_call: {
            name: 'tool',
            approval: {
              actionId: 'action',
              allowed_decisions: ['approve', 'reject', 'edit', 'respond'],
              description: 'Review this action',
              secret: 'private',
            },
          },
        },
      ],
    } as ConversationMessageResource;
    expect(projectConversationMessage(source).content).toEqual([
      {
        type: 'tool_call',
        tool_call: {
          name: 'tool',
          approval: {
            actionId: 'action',
            allowed_decisions: ['approve', 'reject', 'edit', 'respond'],
            description: 'Review this action',
          },
        },
      },
    ]);
    expect(
      projectConversationMessage({
        content: [
          {
            type: 'tool_call',
            tool_call: { approval: { actionId: 'action', allowed_decisions: ['invalid'] } },
          },
        ],
      } as ConversationMessageResource).content,
    ).toEqual([]);
  });

  it('returns only persisted skill strings with empty defaults', () => {
    const source = {
      manualSkills: ['selected', null, 12],
      alwaysAppliedSkills: ['automatic'],
    } as unknown as ConversationMessageResource;
    expect(projectConversationMessage(source)).toMatchObject({
      manualSkills: ['selected'],
      alwaysAppliedSkills: ['automatic'],
    });
    expect(projectConversationMessage({} as ConversationMessageResource)).toMatchObject({
      manualSkills: [],
      alwaysAppliedSkills: [],
    });
  });
});

describe('heterogeneous artifacts and background receipts', () => {
  it.each(['web_search', 'file_search'])(
    'preserves public %s citations and strips unused data',
    (type) => {
      const payload = {
        turn: 1,
        organic: [
          {
            link: 'https://example.com',
            title: 'Source',
            content: 'Excerpt',
            highlights: ['private'],
            sitelinks: [],
          },
        ],
        topStories: [{ link: 'https://example.com/news', source: 'News' }],
        images: [{ imageUrl: 'https://example.com/image', imageWidth: 100 }],
        videos: [{ link: 'https://example.com/video', duration: '1:00' }],
        references: [{ link: 'file-reference', type: 'file', title: 'Document' }],
        answerBox: { snippet: 'Answer' },
        news: [{ title: 'Unused' }],
        credentials: 'private',
      };
      const result = projectConversationMessage({
        attachments: [
          { type, [type]: payload, toolCallId: 'tool', agentId: 'agent', user: 'private' },
        ],
      } as ConversationMessageResource);
      expect(result.attachments).toEqual([
        {
          type,
          toolCallId: 'tool',
          agentId: 'agent',
          [type]: {
            turn: 1,
            organic: [{ link: 'https://example.com', title: 'Source', content: 'Excerpt' }],
            topStories: payload.topStories,
            images: payload.images,
            videos: payload.videos,
            references: payload.references,
            answerBox: payload.answerBox,
          },
        },
      ]);
    },
  );

  it('preserves memory, UI resources and workspace file changes', () => {
    const attachments = [
      {
        type: 'memory',
        memory: {
          key: 'preference',
          value: 'short',
          type: 'update',
          agentId: 'agent',
          secret: 'private',
        },
      },
      {
        type: 'ui_resources',
        ui_resources: [
          {
            resourceId: 'resource',
            uri: 'ui://resource',
            mimeType: 'text/html',
            text: 'UI text',
            credentials: 'private',
          },
        ],
      },
      {
        filename: 'result.txt',
        expiresAt: 42,
        workspaceChange: { profile: 'stateful', operation: 'created', path: 'result.txt' },
      },
    ];
    expect(
      projectConversationMessage({ attachments } as ConversationMessageResource).attachments,
    ).toEqual([
      {
        type: 'memory',
        memory: { key: 'preference', value: 'short', type: 'update', agentId: 'agent' },
      },
      {
        type: 'ui_resources',
        ui_resources: [
          { resourceId: 'resource', uri: 'ui://resource', mimeType: 'text/html', text: 'UI text' },
        ],
      },
      attachments[2],
    ]);
  });

  it.each(['web_search', 'file_search', 'memory', 'ui_resources'])(
    'does not treat malformed %s as a file',
    (type) => {
      expect(
        projectConversationMessage({
          attachments: [{ type, [type]: 'invalid' }],
        } as ConversationMessageResource).attachments,
      ).toEqual([]);
    },
  );

  it.each([new Date('2026-01-01T00:00:00Z'), '2026-01-01T00:00:00.000Z'])(
    'returns only public background receipt fields for %s',
    (settledAt) => {
      const backgroundTask = {
        version: 1,
        taskId: 'task',
        toolName: 'tool',
        status: 'completed',
        settledAt,
        resultClaim: { claimId: 'private' },
        completionWakeup: true,
      };
      const part = { type: 'tool_call', tool_call: { name: 'tool', backgroundTask } };
      const response = projectConversationMessage({
        content: [
          part,
          { type: 'tool_call', tool_call: { name: 'subagent', subagent_content: [part] } },
        ],
      } as ConversationMessageResource);
      const expected = {
        type: 'tool_call',
        tool_call: {
          name: 'tool',
          backgroundTask: {
            version: 1,
            taskId: 'task',
            toolName: 'tool',
            status: 'completed',
            settledAt: '2026-01-01T00:00:00.000Z',
          },
        },
      };
      expect(response.content).toEqual([
        expected,
        { type: 'tool_call', tool_call: { name: 'subagent', subagent_content: [expected] } },
      ]);
    },
  );
});

it('preserves file-search source passages and public file metadata', () => {
  const source = {
    fileId: 'file',
    fileName: 'notes.pdf',
    relevance: 0.9,
    content: 'Passage',
    pages: [1],
    pageRelevance: { 1: 0.9 },
    metadata: {
      fileType: 'application/pdf',
      fileBytes: 42,
      storageType: 'local',
      credentials: 'private',
    },
  };
  expect(
    projectConversationMessage({
      attachments: [{ type: 'file_search', file_search: { sources: [source] } }],
    } as ConversationMessageResource).attachments,
  ).toEqual([
    {
      type: 'file_search',
      file_search: {
        sources: [
          {
            ...source,
            metadata: { fileType: 'application/pdf', fileBytes: 42, storageType: 'local' },
          },
        ],
      },
    },
  ]);
});

it('preserves encoded UI resource bodies without arbitrary renderer options', () => {
  const entry = {
    resourceId: 'resource',
    uri: 'ui://resource',
    mimeType: 'text/html',
    blob: 'PGgxPkhlbGxvPC9oMT4=',
    contentType: 'private-override',
  };
  expect(
    projectConversationMessage({
      attachments: [{ type: 'ui_resources', ui_resources: [entry] }],
    } as ConversationMessageResource).attachments,
  ).toEqual([
    {
      type: 'ui_resources',
      ui_resources: [
        {
          resourceId: 'resource',
          uri: 'ui://resource',
          mimeType: 'text/html',
          blob: 'PGgxPkhlbGxvPC9oMT4=',
        },
      ],
    },
  ]);
});

describe('public message snapshot metadata', () => {
  it.each(['pending', 'ready', 'failed'])(
    'preserves %s preview state on files and attachments',
    (status) => {
      const file = {
        file_id: 'file',
        filename: 'report.docx',
        status,
        textFormat: 'html',
        text: '<p>Preview</p>',
        previewError: 'parser-error',
        source: 'execute_code',
        object: 'file',
        usage: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-02-01T00:00:00Z'),
        storageKey: 'private',
      };
      const response = projectConversationMessage({
        files: [file],
        attachments: [file],
      } as ConversationMessageResource);
      const expected = {
        ...file,
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-02-01T00:00:00.000Z',
      };
      const { storageKey: _storageKey, ...publicExpected } = expected;
      expect(response.files).toEqual([publicExpected]);
      expect(response.attachments).toEqual([publicExpected]);
    },
  );

  it('validates preview markers and retains nullable legacy formats', () => {
    const response = projectConversationMessage({
      files: [
        { file_id: 'legacy', textFormat: null },
        { status: 'invalid' },
        { textFormat: 'unsafe' },
      ],
    } as ConversationMessageResource);
    expect(response.files).toEqual([{ file_id: 'legacy', textFormat: null }]);
  });

  it.each([
    {
      rating: 'thumbsUp',
      tag: { key: 'accurate_reliable', label: 'Private label', arbitrary: 'private' },
      text: 'Useful',
      user: 'private',
    },
    { rating: 'thumbsUp', tag: 'accurate_reliable', text: 'Useful' },
  ])('returns canonical minimal feedback from stored or serialized tags', (feedback) => {
    expect(
      projectConversationMessage({ feedback } as unknown as ConversationMessageResource).feedback,
    ).toEqual({ rating: 'thumbsUp', tag: 'accurate_reliable', text: 'Useful' });
  });

  it('preserves legacy rating-only feedback and rejects invalid feedback', () => {
    expect(
      projectConversationMessage({
        feedback: { rating: 'thumbsDown' },
      } as ConversationMessageResource).feedback,
    ).toEqual({ rating: 'thumbsDown' });
    for (const feedback of [
      { rating: 'invalid' },
      { rating: 'thumbsUp', tag: 'not_helpful' },
      { rating: 'thumbsUp', text: 1 },
    ]) {
      expect(
        projectConversationMessage({ feedback } as unknown as ConversationMessageResource).feedback,
      ).toBeNull();
    }
    expect(projectConversationMessage({} as ConversationMessageResource).feedback).toBeNull();
  });

  it('retains the complete reasoning-label revision domain', () => {
    const part = {
      type: 'think',
      think: 'Reasoning',
      reasoning_label: 'Checking',
      reasoning_label_step_id: 'step',
      reasoning_label_revision: 3,
      reasoning_label_attempts: 4,
      reasoning_label_submitted_chars: 80,
      reasoning_label_status: 'streaming',
    };
    expect(
      projectConversationMessage({ content: [part] } as ConversationMessageResource).content,
    ).toEqual([part]);
    expect(
      projectConversationMessage({
        content: [{ ...part, reasoning_label_revision: -1 }],
      } as ConversationMessageResource).content,
    ).toEqual([]);
  });
});

describe('public usage metadata', () => {
  it('preserves the complete public usage/context contract and strips private fields', () => {
    const metadata = {
      usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 3, cost: 0.02 },
      summaryUsedTokens: 50,
      contextUsage: {
        runId: 'run',
        agentId: 'agent',
        contextBudget: 100,
        effectiveInstructionTokens: 12,
        prePruneContextTokens: 120,
        remainingContextTokens: -20,
        calibrationRatio: 1.2,
        completedOutputTokens: 4,
        breakdown: {
          maxContextTokens: 100,
          instructionTokens: 12,
          systemMessageTokens: 2,
          dynamicInstructionTokens: 3,
          toolSchemaTokens: 7,
          summaryTokens: 10,
          toolCount: 1,
          messageCount: 2,
          messageTokens: 108,
          availableForMessages: -8,
          toolTokenCounts: { search: 7 },
          deferredToolNames: ['search'],
        },
      },
    };
    expect(
      projectConversationMessage({
        metadata: {
          ...metadata,
          thoughtSignatures: { call: 'private' },
          unknown: 'private',
          usage: { ...metadata.usage, private: true },
          contextUsage: {
            ...metadata.contextUsage,
            private: true,
            breakdown: { ...metadata.contextUsage.breakdown, private: true },
          },
        },
      } as unknown as ConversationMessageResource).metadata,
    ).toEqual(metadata);
  });

  it.each([
    undefined,
    null,
    [],
    { usage: { input: '10' } },
    { summaryUsedTokens: -1 },
    { summaryUsedTokens: Infinity },
    { contextUsage: { breakdown: {} } },
  ])('omits malformed metadata: %j', (metadata) => {
    expect(
      projectConversationMessage({ metadata } as unknown as ConversationMessageResource).metadata,
    ).toBeNull();
  });

  it('accepts optional public metadata independently', () => {
    expect(
      projectConversationMessage({
        metadata: { summaryUsedTokens: 0 },
      } as unknown as ConversationMessageResource).metadata,
    ).toEqual({ summaryUsedTokens: 0 });
  });
});
