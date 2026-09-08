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
      endpoint: 'must-not-leak',
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
