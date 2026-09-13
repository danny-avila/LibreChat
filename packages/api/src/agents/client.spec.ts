import { ContentTypes } from 'librechat-data-provider';
import { Tokenizer as AiTokenizer } from 'ai-tokenizer';
import { Providers, StandardGraph } from '@librechat/agents';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import type { TMessage } from 'librechat-data-provider';
import {
  countRetainedToolTokens,
  createCachedTokenCounter,
  prependQuotes,
  prependFileContext,
  applyAttachmentOnlyText,
  type FormattedMessageWithContent,
} from './client';
import { ATTACHMENT_ONLY_TEXT } from '~/files/context';
import Tokenizer from '~/utils/tokenizer';

describe('createCachedTokenCounter', () => {
  it('enables stable-message reuse in the agents runtime', async () => {
    const getTokenCount = jest.spyOn(AiTokenizer.prototype, 'count');
    try {
      const tokenCounter = await createCachedTokenCounter('o200k_base');
      const graph = new StandardGraph({
        runId: 'token-cache-integration',
        agents: [
          {
            agentId: 'primary',
            provider: Providers.OPENAI,
            instructions: 'Test instructions',
          },
        ],
        tokenCounter,
      });
      const agentContext = graph.agentContexts.get('primary');
      await agentContext?.tokenCalculationPromise;
      getTokenCount.mockClear();
      const message = new HumanMessage('Stable retained context');

      agentContext?.contextPressureTokenCounts?.count(message);
      const callsAfterFirstCount = getTokenCount.mock.calls.length;
      agentContext?.contextPressureTokenCounts?.count(message);

      expect(callsAfterFirstCount).toBeGreaterThan(0);
      expect(getTokenCount).toHaveBeenCalledTimes(callsAfterFirstCount);
    } finally {
      getTokenCount.mockRestore();
    }
  });
});

describe('countRetainedToolTokens', () => {
  const toolPart = (name: string, output: string) => ({
    type: ContentTypes.TOOL_CALL,
    tool_call: { name, args: '{"path":"a"}', output },
  });

  beforeAll(async () => {
    /** The run loads its encoding before the graph starts, so the save path counts
     *  against a warm tokenizer; a cold one withdraws the figure (below). */
    await Tokenizer.initEncoding('o200k_base');
    await Tokenizer.initEncoding('claude');
  });

  it('counts only the tool results produced after the snapshot boundary', () => {
    const parts = [
      toolPart('grep', 'x'.repeat(4000)),
      { type: ContentTypes.TEXT, text: 'calling the tool' },
      toolPart('read_file', 'the retained result'),
    ];

    /** Everything before the boundary is already inside the snapshot's own
     *  message tokens; counting it again would double the whole loop. */
    const retained = countRetainedToolTokens(parts, 1, 'o200k_base');
    expect(retained).toBeGreaterThan(0);
    expect(retained).toBeLessThan(countRetainedToolTokens(parts, 0, 'o200k_base') ?? 0);
    expect(retained).toBe(countRetainedToolTokens([parts[2]], 0, 'o200k_base'));
  });

  it('ignores the model-authored call and everything that is not a tool result', () => {
    /** Name and arguments are output tokens the snapshot's `completedOutputTokens`
     *  already carries, and assistant text is output too. */
    const args = '{"path":"a"}';
    const nameAndArgs = [
      { type: ContentTypes.TOOL_CALL, tool_call: { name: 'read_file', args } },
      { type: ContentTypes.TEXT, text: 'a long assistant explanation of the call' },
      { type: ContentTypes.THINK, think: 'reasoning that never re-enters context' },
    ];
    expect(countRetainedToolTokens(nameAndArgs, 0, 'o200k_base')).toBe(0);
  });

  it('applies the Claude framing correction, matching the counter the snapshot used', () => {
    const parts = [toolPart('read_file', 'r'.repeat(500))];
    const base = countRetainedToolTokens(parts, 0, 'o200k_base') ?? 0;
    const claude = countRetainedToolTokens(parts, 0, 'claude') ?? 0;
    expect(base).toBeGreaterThan(0);
    expect(claude).toBeGreaterThan(base * 1.05);
  });

  it('reports nothing rather than an estimate when the encoding is unavailable', () => {
    /** A gauge missing the retained result is better than exact provider figures
     *  with a guess folded in, so an uncountable result withdraws the whole value. */
    const count = jest
      .spyOn(Tokenizer, 'countExactTokens')
      .mockReturnValueOnce(undefined as unknown as number);
    try {
      expect(
        countRetainedToolTokens([toolPart('grep', 'result')], 0, 'o200k_base'),
      ).toBeUndefined();
    } finally {
      count.mockRestore();
    }
  });

  it('returns zero for a turn with no content and for an out-of-range boundary', () => {
    expect(countRetainedToolTokens(undefined, 0, 'o200k_base')).toBe(0);
    expect(countRetainedToolTokens([toolPart('grep', 'result')], 5, 'o200k_base')).toBe(0);
    expect(countRetainedToolTokens([toolPart('grep', 'result')], Number.NaN, 'o200k_base')).toBe(
      countRetainedToolTokens([toolPart('grep', 'result')], 0, 'o200k_base'),
    );
  });
});

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

describe('prependQuotes', () => {
  it('prepends a single quote as a blockquote to string content', () => {
    const message: FormattedMessageWithContent = { content: 'Explain this.' };

    prependQuotes(message, ['the selected text']);

    expect(message.content).toBe('> the selected text\n\nExplain this.');
  });

  it('separates multiple quotes with a blank line', () => {
    const message: FormattedMessageWithContent = { content: 'Compare these.' };

    prependQuotes(message, ['first', 'second']);

    expect(message.content).toBe('> first\n\n> second\n\nCompare these.');
  });

  it('prepends to the first text part of array content, leaving other parts intact', () => {
    const message: FormattedMessageWithContent = {
      content: [
        { type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } },
        { type: ContentTypes.TEXT, text: 'Explain this.' },
      ],
    };

    prependQuotes(message, ['excerpt']);

    if (!Array.isArray(message.content)) {
      throw new Error('Expected array content');
    }
    expect(message.content[1].text).toBe('> excerpt\n\nExplain this.');
    expect(message.content[0]).toEqual({
      type: ContentTypes.IMAGE_URL,
      image_url: { url: 'data:image/png;base64,abc' },
    });
  });

  it('adds a text part when an array has none', () => {
    const message: FormattedMessageWithContent = {
      content: [{ type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } }],
    };

    prependQuotes(message, ['excerpt']);

    expect(message.content).toEqual([
      { type: ContentTypes.TEXT, text: '> excerpt' },
      { type: ContentTypes.IMAGE_URL, image_url: { url: 'data:image/png;base64,abc' } },
    ]);
  });

  it('leaves content unchanged when there are no quotes', () => {
    const message: FormattedMessageWithContent = { content: 'Explain this.' };

    prependQuotes(message, []);
    expect(message.content).toBe('Explain this.');

    prependQuotes(message, null);
    expect(message.content).toBe('Explain this.');
  });
});

describe('applyAttachmentOnlyText', () => {
  const withFiles = [{ file_id: 'f1' }] as TMessage['files'];

  it('substitutes text for an empty user turn that carries files', () => {
    const message: FormattedMessageWithContent = { role: 'user', content: '' };

    applyAttachmentOnlyText(message, withFiles);

    expect(message.content).toBe(ATTACHMENT_ONLY_TEXT);
  });

  it('leaves a user turn that already has text alone', () => {
    const message: FormattedMessageWithContent = { role: 'user', content: 'Summarize it' };

    applyAttachmentOnlyText(message, withFiles);

    expect(message.content).toBe('Summarize it');
  });

  it('leaves content that quotes or file context already filled alone', () => {
    const message: FormattedMessageWithContent = {
      role: 'user',
      content: [{ type: ContentTypes.TEXT, text: 'Attached file text' }],
    };

    applyAttachmentOnlyText(message, withFiles);

    expect(message.content).toEqual([{ type: ContentTypes.TEXT, text: 'Attached file text' }]);
  });

  it('ignores turns without files', () => {
    const message: FormattedMessageWithContent = { role: 'user', content: '' };

    applyAttachmentOnlyText(message, []);
    expect(message.content).toBe('');

    applyAttachmentOnlyText(message, null);
    expect(message.content).toBe('');
  });

  it('ignores non-user turns', () => {
    const message: FormattedMessageWithContent = { role: 'assistant', content: '' };

    applyAttachmentOnlyText(message, withFiles);

    expect(message.content).toBe('');
  });
});
