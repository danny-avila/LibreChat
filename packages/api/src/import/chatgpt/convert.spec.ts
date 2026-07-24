import type { ChatGptConversation } from '~/import/types';
import { convertConversation } from './convert';

const CITE = '';

function conversation(mapping: ChatGptConversation['mapping']): ChatGptConversation {
  return {
    conversation_id: 'ext-1',
    title: 'Trip planning',
    create_time: 1700000000,
    update_time: 1700000100,
    default_model_slug: 'gpt-5-thinking',
    is_archived: true,
    is_starred: true,
    pinned_time: null,
    mapping,
  };
}

const OPTIONS = { userId: 'u1', assets: new Map<string, string>(), defaultModel: 'gpt-4o' };

describe('convertConversation', () => {
  it('carries archive, pin, model, and external id onto the conversation', () => {
    const result = convertConversation(
      conversation({
        root: { id: 'root', message: null, parent: null, children: ['a'] },
        a: {
          id: 'a',
          message: {
            id: 'a',
            author: { role: 'user', name: null },
            create_time: 1700000001,
            content: { content_type: 'text', parts: ['hi'] },
          },
          parent: 'root',
          children: [],
        },
      }),
      OPTIONS,
    );

    expect(result.isArchived).toBe(true);
    expect(result.pinned).toBe(true);
    expect(result.model).toBe('gpt-5-thinking');
    expect(result.externalId).toBe('ext-1');
    expect(result.title).toBe('Trip planning');
  });

  it('links children to parents and skips system messages transparently', () => {
    const result = convertConversation(
      conversation({
        root: { id: 'root', message: null, parent: null, children: ['sys'] },
        sys: {
          id: 'sys',
          message: {
            id: 'sys',
            author: { role: 'system', name: null },
            create_time: 1700000001,
            content: { content_type: 'text', parts: [''] },
          },
          parent: 'root',
          children: ['u'],
        },
        u: {
          id: 'u',
          message: {
            id: 'u',
            author: { role: 'user', name: null },
            create_time: 1700000002,
            content: { content_type: 'text', parts: ['question'] },
          },
          parent: 'sys',
          children: [],
        },
      }),
      OPTIONS,
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].text).toBe('question');
    expect(result.messages[0].parentMessageId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('folds thoughts into the answer as a think part and drops the recap', () => {
    const result = convertConversation(
      conversation({
        root: { id: 'root', message: null, parent: null, children: ['t'] },
        t: {
          id: 't',
          message: {
            id: 't',
            author: { role: 'assistant', name: null },
            create_time: 1700000002,
            content: {
              content_type: 'thoughts',
              thoughts: [{ content: 'Weighing options', summary: 'Deciding' }],
            },
          },
          parent: 'root',
          children: ['r'],
        },
        r: {
          id: 'r',
          message: {
            id: 'r',
            author: { role: 'assistant', name: null },
            create_time: 1700000003,
            content: { content_type: 'reasoning_recap', content: 'Thought for 7 seconds' },
          },
          parent: 't',
          children: ['a'],
        },
        a: {
          id: 'a',
          message: {
            id: 'a',
            author: { role: 'assistant', name: null },
            create_time: 1700000004,
            content: { content_type: 'text', parts: ['Here is the answer'] },
            metadata: { model_slug: 'gpt-5-thinking' },
          },
          parent: 'r',
          children: [],
        },
      }),
      OPTIONS,
    );

    expect(result.messages).toHaveLength(1);
    const [answer] = result.messages;
    expect(answer.sender).toBe('GPT-5 Thinking');
    expect(answer.content).toEqual([
      { type: 'think', think: 'Weighing options' },
      { type: 'text', text: 'Here is the answer' },
    ]);
  });

  it('attaches rebuilt citations to the assistant message', () => {
    const result = convertConversation(
      conversation({
        root: { id: 'root', message: null, parent: null, children: ['a'] },
        a: {
          id: 'a',
          message: {
            id: 'a',
            author: { role: 'assistant', name: null },
            create_time: 1700000002,
            content: { content_type: 'text', parts: [`Answer.${CITE}turn0search0`] },
            metadata: {
              model_slug: 'gpt-4o',
              content_references: [
                { type: 'webpage', alt: null, url: 'https://a.com', title: 'A', snippet: null },
              ],
            },
          },
          parent: 'root',
          children: [],
        },
      }),
      OPTIONS,
    );

    const [answer] = result.messages;
    expect(answer.attachments).toHaveLength(1);
    expect(answer.attachments?.[0].type).toBe('web_search');
    expect(answer.attachments?.[0].web_search.turn).toBe(0);
  });

  it('reports asset pointers for later ingestion', () => {
    const result = convertConversation(
      conversation({
        root: { id: 'root', message: null, parent: null, children: ['a'] },
        a: {
          id: 'a',
          message: {
            id: 'a',
            author: { role: 'user', name: null },
            create_time: 1700000002,
            content: {
              content_type: 'multimodal_text',
              parts: [
                { content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-A' },
                'what is this',
              ],
            },
          },
          parent: 'root',
          children: [],
        },
      }),
      OPTIONS,
    );

    expect(result.messages[0].assetPointers).toEqual(['file-service://file-A']);
  });

  it('survives a parent cycle without hanging', () => {
    const result = convertConversation(
      conversation({
        a: {
          id: 'a',
          message: {
            id: 'a',
            author: { role: 'user', name: null },
            create_time: 1700000001,
            content: { content_type: 'text', parts: ['one'] },
          },
          parent: 'b',
          children: [],
        },
        b: {
          id: 'b',
          message: {
            id: 'b',
            author: { role: 'user', name: null },
            create_time: 1700000002,
            content: { content_type: 'text', parts: ['two'] },
          },
          parent: 'a',
          children: [],
        },
      }),
      OPTIONS,
    );

    expect(result.messages).toHaveLength(2);
  });
});
