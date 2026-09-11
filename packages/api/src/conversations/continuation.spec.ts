import { Constants } from 'librechat-data-provider';
import type { ImportedConversationMessage } from '@librechat/data-schemas';
import { buildImportedAssistantPrompt } from './continuation';

const message = (
  id: string,
  parent: string = String(Constants.NO_PARENT),
): ImportedConversationMessage =>
  ({
    messageId: id,
    parentMessageId: parent,
    conversationId: 'conversation',
    text: id,
    isCreatedByUser: id === 'root',
    isUserSubmitted: true,
  }) as ImportedConversationMessage;
const input = {
  userId: 'owner',
  tenantId: 'tenant',
  conversationId: 'conversation',
  parentMessageId: 'leaf',
  endpoint: 'assistants',
  text: 'Follow up',
};

describe('imported Assistants continuation', () => {
  it('replays only the selected owned branch as plain text context', async () => {
    const getImportedAssistantMessages = jest
      .fn()
      .mockResolvedValue([message('sibling', 'root'), message('leaf', 'root'), message('root')]);
    const result = await buildImportedAssistantPrompt(input, { getImportedAssistantMessages });
    expect(getImportedAssistantMessages).toHaveBeenCalledWith(
      'owner',
      'tenant',
      'conversation',
      'assistants',
    );
    expect(result.indexOf('root')).toBeLessThan(result.indexOf('leaf'));
    expect(result).not.toContain('sibling');
    expect(result).toContain('Follow up');
    expect(result).toContain('"role":"assistant"');
    expect(result).not.toContain('isUserSubmitted');
  });

  it('replays sanitized attachment and quoted context as text', async () => {
    const result = await buildImportedAssistantPrompt(input, {
      getImportedAssistantMessages: jest.fn().mockResolvedValue([
        {
          ...message('leaf'),
          text: '',
          content: [],
          quotes: ['Quoted context'],
          files: [
            {
              file_id: 'file',
              filename: 'notes.txt',
              text: 'Extracted notes',
              privateKey: 'private',
            },
          ],
          attachments: [
            {
              type: 'web_search',
              web_search: {
                organic: [
                  {
                    title: 'Search result',
                    link: 'https://example.com',
                    snippet: 'Search context',
                  },
                ],
                credentials: 'private',
              },
            },
          ],
        },
      ]),
    });
    for (const value of ['notes.txt', 'Extracted notes', 'Search context', 'Quoted context'])
      expect(result).toContain(value);
    expect(result).not.toContain('private');
    expect(result).toContain('"files":');
  });

  it('bounds long replay to recent context without truncating current input', async () => {
    const result = await buildImportedAssistantPrompt(input, {
      getImportedAssistantMessages: jest.fn().mockResolvedValue([
        { ...message('root'), text: 'Old context ' + 'a'.repeat(50000) },
        { ...message('leaf', 'root'), text: 'Recent context' },
      ]),
    });
    expect(result.length).toBeLessThanOrEqual(32768);
    expect(result).toContain('[Earlier imported context omitted]');
    expect(result).not.toContain('Old context');
    expect(result).toContain('Recent context');
    expect(result.endsWith('Current message:\nFollow up')).toBe(true);
  });

  it('preserves a current message that consumes the provider message budget', async () => {
    const text = 'x'.repeat(32768);
    expect(
      await buildImportedAssistantPrompt(
        { ...input, text },
        {
          getImportedAssistantMessages: jest.fn().mockResolvedValue([message('leaf')]),
        },
      ),
    ).toBe(text);
  });

  it.each([
    null,
    [message('leaf', 'missing')],
    [message('leaf', 'leaf')],
    [{ ...message('leaf'), isUserSubmitted: false }],
    [{ ...message('leaf'), thread_id: 'live-thread' }],
    Array.from({ length: 4097 }, (_, index) => message(String(index))),
    [{ ...message('leaf'), text: 'a'.repeat(8 * 1024 * 1024) }],
  ])('rejects absent, invalid or non-imported branches', async (messages) => {
    await expect(
      buildImportedAssistantPrompt(input, {
        getImportedAssistantMessages: jest.fn().mockResolvedValue(messages),
      }),
    ).rejects.toThrow('Missing thread_id');
  });

  it('can initialize an empty owned conversation', async () => {
    expect(
      await buildImportedAssistantPrompt(
        { ...input, parentMessageId: String(Constants.NO_PARENT) },
        {
          getImportedAssistantMessages: jest.fn().mockResolvedValue([]),
        },
      ),
    ).toBe('Follow up');
  });

  it.each(['text', 'content_part'] as const)(
    'revalidates imported text against %s policy',
    async (field) => {
      const config: Parameters<typeof buildImportedAssistantPrompt>[0]['config'] = {
        filters: {
          messages: {
            pii: {
              fields: [field],
              starterPatterns: [],
              customPatterns: [{ id: 'private', label: 'private value', regex: 'PRIVATE-[A-Z]+' }],
            },
          },
        },
      };
      await expect(
        buildImportedAssistantPrompt(
          { ...input, config },
          {
            getImportedAssistantMessages: jest
              .fn()
              .mockResolvedValue([{ ...message('leaf'), text: 'PRIVATE-NOTE' }]),
          },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    },
  );
});
