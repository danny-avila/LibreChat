import { addBedrockCacheControl } from './addBedrockCacheControl';
import { ContentTypes, Agents } from 'librechat-data-provider';

type TestMsg = {
  role?: 'user' | 'assistant';
  content?: string | Agents.MessageContentComplex[];
};

describe('addBedrockCacheControl (Bedrock cache checkpoints)', () => {
  it('returns input when not enough messages', () => {
    const empty: TestMsg[] = [];
    expect(addBedrockCacheControl(empty)).toEqual(empty);
    const single: TestMsg[] = [{ role: 'user', content: 'only' }];
    expect(addBedrockCacheControl(single)).toEqual(single);
  });

  it('wraps string content and appends separate cachePoint block', () => {
    const messages: TestMsg[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: [{ type: ContentTypes.TEXT, text: 'Hi' }] },
    ];
    const result = addBedrockCacheControl(messages);
    const last = result[1].content as Agents.MessageContentComplex[];
    expect(Array.isArray(last)).toBe(true);
    expect(last[0]).toEqual({ type: ContentTypes.TEXT, text: 'Hi' });
    expect(last[1]).toEqual({ cachePoint: { type: 'default' } });
  });

  it('inserts cachePoint after the last text when multiple text blocks exist', () => {
    const messages: TestMsg[] = [
      {
        role: 'user',
        content: [
          { type: ContentTypes.TEXT, text: 'Intro' },
          { type: ContentTypes.TEXT, text: 'Details' },
          { type: ContentTypes.IMAGE_FILE, image_file: { file_id: 'file_123' } },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: ContentTypes.TEXT, text: 'Reply A' },
          { type: ContentTypes.TEXT, text: 'Reply B' },
        ],
      },
    ];

    const result = addBedrockCacheControl(messages);

    const first = result[0].content as Agents.MessageContentComplex[];
    const second = result[1].content as Agents.MessageContentComplex[];

    expect(first[0]).toEqual({ type: ContentTypes.TEXT, text: 'Intro' });
    expect(first[1]).toEqual({ type: ContentTypes.TEXT, text: 'Details' });
    expect(first[2]).toEqual({ cachePoint: { type: 'default' } });

    const img = first[3] as Agents.MessageContentComplex;
    expect(img.type).toBe(ContentTypes.IMAGE_FILE);
    if (img.type === ContentTypes.IMAGE_FILE) {
      expect('image_file' in img).toBe(true);
    }

    expect(second[0]).toEqual({ type: ContentTypes.TEXT, text: 'Reply A' });
    expect(second[1]).toEqual({ type: ContentTypes.TEXT, text: 'Reply B' });
    expect(second[2]).toEqual({ cachePoint: { type: 'default' } });
  });

  it('appends cachePoint when content is an empty array', () => {
    const messages: TestMsg[] = [
      { role: 'user', content: [] },
      { role: 'assistant', content: [] },
      { role: 'user', content: 'ignored because only last two are modified' },
    ];

    const result = addBedrockCacheControl(messages);

    const first = result[0].content as Agents.MessageContentComplex[];
    const second = result[1].content as Agents.MessageContentComplex[];

    expect(Array.isArray(first)).toBe(true);
    expect(first.length).toBe(0);

    expect(Array.isArray(second)).toBe(true);
    expect(second.length).toBe(1);
    expect(second[0]).toEqual({ cachePoint: { type: 'default' } });
  });

  /** (I don't think this will ever occur in actual use, but its the only branch left uncovered so I'm covering it */
  it('skips messages with non-string, non-array content and still modifies the previous to reach two edits', () => {
    const messages: TestMsg[] = [
      { role: 'user', content: [{ type: ContentTypes.TEXT, text: 'Will be modified' }] },
      { role: 'assistant', content: undefined },
      { role: 'user', content: [{ type: ContentTypes.TEXT, text: 'Also modified' }] },
    ];

    const result = addBedrockCacheControl(messages);

    const last = result[2].content as Agents.MessageContentComplex[];
    expect(last[0]).toEqual({ type: ContentTypes.TEXT, text: 'Also modified' });
    expect(last[1]).toEqual({ cachePoint: { type: 'default' } });

    expect(result[1].content).toBeUndefined();

    const first = result[0].content as Agents.MessageContentComplex[];
    expect(first[0]).toEqual({ type: ContentTypes.TEXT, text: 'Will be modified' });
    expect(first[1]).toEqual({ cachePoint: { type: 'default' } });
  });
});
