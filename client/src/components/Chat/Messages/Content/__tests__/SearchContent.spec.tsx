import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { rendersMarkdownLite } from '~/components/Chat/Messages/Content/SearchContent';

describe('rendersMarkdownLite', () => {
  const message = (content?: TMessageContentParts[]): TMessage =>
    ({ messageId: 'm', text: 'hi', content }) as TMessage;

  it('is true when there are no content parts to render', () => {
    expect(rendersMarkdownLite(message())).toBe(true);
    expect(rendersMarkdownLite(message([]))).toBe(true);
  });

  it('is false once content parts drive the rendering', () => {
    expect(
      rendersMarkdownLite(
        message([{ type: ContentTypes.TEXT, text: 'hi' } as TMessageContentParts]),
      ),
    ).toBe(false);
  });
});
