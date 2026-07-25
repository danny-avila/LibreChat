import { extractChatContent } from './chat';

describe('extractChatContent', () => {
  it('classifies chat and resume fields in their legacy inspection order', () => {
    const editedArguments = { token: 'ORG-DEADBEEF' };
    const body = {
      text: 'typed text',
      quotes: ['  first quote  ', 'api-key:'],
      answer: 'resume answer',
      decisions: [
        {
          responseText: 'decision response',
          reason: 'decision reason',
          editedArguments,
        },
      ],
    };

    const fragments = extractChatContent(body);

    expect(fragments).toEqual([
      {
        id: 'chat.text',
        path: '/text',
        text: 'typed text',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.quote.0',
        path: '/quotes/0',
        text: 'first quote',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.quote.1',
        path: '/quotes/1',
        text: 'api-key:',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.assembled.quote-text',
        path: '/$assembled/quote-text',
        text: '> first quote\n\n> api-key:\n\ntyped text',
        source: 'assembled_context',
        format: 'markdown',
        treatment: 'inspect_only',
        provenance: 'user',
      },
      {
        id: 'chat.answer',
        path: '/answer',
        text: 'resume answer',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.decision.0.response',
        path: '/decisions/0/responseText',
        text: 'decision response',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.decision.0.reason',
        path: '/decisions/0/reason',
        text: 'decision reason',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.decision.0.arguments',
        path: '/decisions/0/editedArguments',
        text: '{"token":"ORG-DEADBEEF"}',
        source: 'tool_argument',
        format: 'json',
        treatment: 'inspect_only',
        provenance: 'user',
      },
    ]);
    expect(body.quotes).toEqual(['  first quote  ', 'api-key:']);
    expect(body.decisions[0].editedArguments).toBe(editedArguments);
  });

  it('ignores unstringifiable edited arguments without dropping other fields', () => {
    const editedArguments: { self?: object } = {};
    editedArguments.self = editedArguments;

    const fragments = extractChatContent({
      answer: 'safe answer',
      decisions: [{ editedArguments }],
    });

    expect(fragments).toHaveLength(1);
    expect(fragments[0]).toMatchObject({
      id: 'chat.answer',
      text: 'safe answer',
    });
  });

  it('retains source indices when quote normalization drops unsupported entries', () => {
    const fragments = extractChatContent({
      quotes: [null, '  first quote  ', '', 42, 'second quote'],
    });

    expect(fragments).toEqual([
      {
        id: 'chat.quote.1',
        path: '/quotes/1',
        text: 'first quote',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.quote.4',
        path: '/quotes/4',
        text: 'second quote',
        source: 'message',
        format: 'plain',
        treatment: 'replaceable',
        provenance: 'user',
      },
      {
        id: 'chat.assembled.quote-text',
        path: '/$assembled/quote-text',
        text: '> first quote\n\n> second quote',
        source: 'assembled_context',
        format: 'markdown',
        treatment: 'inspect_only',
        provenance: 'user',
      },
    ]);
  });

  it('returns no fragments for empty or unsupported fields', () => {
    expect(extractChatContent(undefined)).toEqual([]);
    expect(extractChatContent({ text: '', quotes: [null, 42, '  '] })).toEqual([]);
  });
});
