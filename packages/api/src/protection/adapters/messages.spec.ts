import { extractMessageContent } from './messages';

describe('extractMessageContent', () => {
  it('treats every caller-supplied role as user provenance', () => {
    const fragments = Array.from(
      extractMessageContent([
        { role: 'system', content: 'system text' },
        { role: 'assistant', content: 'assistant text' },
        { role: 'tool', content: 'tool text' },
        { role: 'user', content: 'user text' },
      ]),
    );

    expect(fragments.map(({ text, provenance, source }) => ({ text, provenance, source }))).toEqual(
      [
        { text: 'system text', provenance: 'user', source: 'message' },
        { text: 'assistant text', provenance: 'user', source: 'message' },
        { text: 'tool text', provenance: 'user', source: 'message' },
        { text: 'user text', provenance: 'user', source: 'message' },
      ],
    );
  });

  it('extracts every text-bearing content part without trusting its declared type', () => {
    const fragments = Array.from(
      extractMessageContent([
        {
          role: 'user',
          content: [
            { type: 'image_url' },
            { type: 'image_url', text: 'text on a non-text part' },
            { type: 'text', text: 'ordinary text part' },
            null,
          ],
        },
      ]),
    );

    expect(fragments).toEqual([
      {
        id: 'external-message.0.part.1',
        path: '/0/content/1/text',
        text: 'text on a non-text part',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'external-message.0.part.2',
        path: '/0/content/2/text',
        text: 'ordinary text part',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
    ]);
  });
});
