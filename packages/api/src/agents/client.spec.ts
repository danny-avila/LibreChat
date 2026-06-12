import { ContentTypes } from 'librechat-data-provider';
import { prependFileContext, type FormattedMessageWithContent } from './client';

describe('prependFileContext', () => {
  it('prepends file context to string content', () => {
    const message: FormattedMessageWithContent = { content: 'Answer this question.' };

    prependFileContext(message, 'Attached file text');

    expect(message.content).toBe('Attached file text\nAnswer this question.');
  });

  it('prepends file context to the first text content part', () => {
    const message: FormattedMessageWithContent = {
      content: [
        { type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } },
        { type: ContentTypes.TEXT, text: 'Answer this question.' },
      ],
    };

    prependFileContext(message, 'Attached file text');

    expect(Array.isArray(message.content)).toBe(true);
    if (!Array.isArray(message.content)) {
      throw new Error('Expected array content');
    }
    expect(message.content[1].text).toBe('Attached file text\nAnswer this question.');
    expect(message.content[0]).toEqual({
      type: ContentTypes.IMAGE_URL,
      image_url: { url: 'data:image/png;base64,abc' },
    });
  });

  it('adds a text content part when an array has no text part', () => {
    const message: FormattedMessageWithContent = {
      content: [{ type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } }],
    };

    prependFileContext(message, 'Attached file text');

    expect(message.content).toEqual([
      { type: ContentTypes.TEXT, text: 'Attached file text' },
      { type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } },
    ]);
  });

  it('leaves content unchanged when file context is empty', () => {
    const message: FormattedMessageWithContent = { content: 'Answer this question.' };

    prependFileContext(message, '');

    expect(message.content).toBe('Answer this question.');
  });
});
