import { ContentTypes } from 'librechat-data-provider';
import type { Agents, TMessage } from 'librechat-data-provider';
import { applyRetainedContentEdit, projectRetainedMessageContent } from '../retained';

describe('retained message content', () => {
  test('captures edited history and provenance before continuing, clearing stale reasoning labels', async () => {
    const message: Partial<TMessage> = {
      isUserSubmitted: true,
      content: [{ type: ContentTypes.THINK, think: 'Old', reasoning_label: 'Stale title' }],
      userSubmittedMessageFieldPaths: [],
    };
    const capture = jest.fn();
    await applyRetainedContentEdit(message, { index: 0, type: 'think', think: 'Edited' }, capture);
    expect(capture).toHaveBeenCalledWith([{ type: 'think', think: 'Edited' }], 'think', {
      userSubmittedPaths: ['/content/0/think', '/content/0'],
      userSubmittedMessageFieldPaths: [],
    });
    expect(message.content?.[0]).not.toHaveProperty('reasoning_label');
  });

  test.each([false, true])(
    'rebases retained and completion provenance after filtering (abort=%s)',
    (abort) => {
      const completion: Agents.MessageContentComplex[] = [
        { type: 'tool_call' },
        { type: 'text', text: ' suffix' },
        {
          type: 'tool_call',
          tool_call: { id: 'ask-new', name: 'ask_user_question', output: 'answer' },
        },
        { type: 'steer', steer: 'Follow up' },
        {
          type: 'activity_label',
          activity_label_type: 'phase',
          activity_start_index: 1,
          activity_end_index: 3,
        },
      ];
      const metadata = {
        retainedContent: {
          parts: [
            {
              type: 'tool_call',
              tool_call: { id: 'ask-old', name: 'ask_user_question', output: 'old answer' },
            },
            { type: 'text', text: 'Prefix' },
          ],
          type: ContentTypes.TEXT as const,
          userSubmittedPaths: ['/content/1/text'],
          userSubmittedMessageFieldPaths: [
            { path: '/content/0/tool_call/output', field: 'answer' as const },
          ],
        },
        userSubmittedPaths: ['/content/0', '/content/2/tool_call/args'],
        userSubmittedMessageFieldPaths: [
          { path: '/content/2/tool_call/output', field: 'answer' as const },
        ],
      };
      const original = structuredClone({ completion, metadata });
      const result = projectRetainedMessageContent(completion, metadata, { abort });
      expect(result.content).toEqual([
        metadata.retainedContent.parts[0],
        { type: 'text', text: 'Prefix suffix' },
        completion[2],
        completion[3],
        { ...completion[4], activity_start_index: 1, activity_end_index: 3 },
      ]);
      expect(result.userSubmittedPaths).toEqual([
        '/content/1/text',
        '/content/2/tool_call/args',
        '/content/3',
      ]);
      expect(result.userSubmittedMessageFieldPaths).toEqual([
        { path: '/content/0/tool_call/output', field: 'answer' },
        { path: '/content/2/tool_call/output', field: 'answer' },
      ]);
      expect({ completion, metadata }).toEqual(original);
    },
  );

  test('filters OAuth and blank slots from both sides without dropping or misattributing the edit', () => {
    const result = projectRetainedMessageContent(
      [
        { type: 'text', text: ' ' },
        { type: 'tool_call', tool_call: { name: 'oauth_mcp_test', auth: 'private-url' } },
        { type: 'tool_call', tool_call: { id: 'ask', output: 'answer' } },
      ],
      {
        retainedContent: {
          type: ContentTypes.TEXT,
          parts: [
            { type: 'tool_call', tool_call: { auth: 'old-private-url' } },
            { type: 'text', text: 'Prefix' },
          ],
          userSubmittedPaths: ['/content/1/text'],
        },
        userSubmittedMessageFieldPaths: [{ path: '/content/2/tool_call/output', field: 'answer' }],
      },
      { abort: true },
    );
    expect(result.content).toEqual([
      { type: 'text', text: 'Prefix' },
      { type: 'tool_call', tool_call: { id: 'ask', output: 'answer' } },
    ]);
    expect(result.userSubmittedPaths).toEqual(['/content/0/text']);
    expect(result.userSubmittedMessageFieldPaths).toEqual([
      { path: '/content/1/tool_call/output', field: 'answer' },
    ]);
  });

  test('persists prefix-only progress and preserves it beside a failure part', () => {
    const metadata = {
      retainedContent: {
        type: ContentTypes.THINK as const,
        parts: [{ type: 'think', think: 'Edited reasoning' }],
        userSubmittedPaths: ['/content/0/think'],
      },
    };
    expect(projectRetainedMessageContent([], metadata, { abort: true })).toEqual({
      content: metadata.retainedContent.parts,
      userSubmittedPaths: ['/content/0/think'],
      userSubmittedMessageFieldPaths: [],
    });
    expect(
      projectRetainedMessageContent([{ type: 'error', error: 'Provider failed' }], metadata)
        .content,
    ).toEqual([...metadata.retainedContent.parts, { type: 'error', error: 'Provider failed' }]);
  });

  test('keeps non-content provenance and expands content-root paths only over their source parts', () => {
    const result = projectRetainedMessageContent(
      [{ type: 'tool_call' }, { type: 'text', text: 'Generated' }],
      {
        retainedContent: {
          type: ContentTypes.THINK,
          parts: [{ type: 'think', think: 'Retained' }],
          userSubmittedPaths: ['/content', '/attachments/0/file_id'],
        },
        userSubmittedPaths: ['/content', '/text'],
        userSubmittedMessageFieldPaths: [{ path: '/content', field: 'answer' }],
      },
    );
    expect(result.content).toEqual([
      { type: 'think', think: 'Retained' },
      { type: 'text', text: 'Generated' },
    ]);
    expect(result.userSubmittedPaths).toEqual([
      '/content/0',
      '/attachments/0/file_id',
      '/content/1',
      '/text',
    ]);
    expect(result.userSubmittedMessageFieldPaths).toEqual([
      { path: '/content/1', field: 'answer' },
    ]);
  });

  test('refuses a disconnect snapshot whose metadata belongs to a replacement', () => {
    expect(() =>
      projectRetainedMessageContent([], { createdAt: 2 }, { expectedCreatedAt: 1 }),
    ).toThrow('Generation changed');
  });
});
