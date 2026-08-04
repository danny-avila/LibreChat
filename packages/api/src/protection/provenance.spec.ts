import { getUserSubmittedMessageFieldPathState, getUserSubmittedPathState } from './provenance';

describe('getUserSubmittedPathState', () => {
  it('keeps only pointers that resolve through safe own properties and expands steer parts', () => {
    const inherited = { inherited: 'not submitted' };
    const message = Object.assign(Object.create(inherited), {
      text: 'submitted text',
      messageId: 'not submitted content',
      attachments: [{ file_id: 'submitted-file' }],
      content: [
        { type: 'text', text: 'model text' },
        { type: 'steer', steer: 'submitted steer' },
        Object.create({ type: 'steer' }),
      ],
      userSubmittedPaths: [
        '/text',
        '/attachments/0',
        '/text',
        '/missing',
        '/messageId',
        '/inherited',
        '/__proto__/polluted',
        '/content/~2invalid',
        'not-a-pointer',
      ],
    });

    expect(getUserSubmittedPathState(message)).toEqual({
      paths: ['/text', '/attachments/0', '/content/1'],
      overflowed: false,
    });
  });

  it('supports the additional protected metadata roots in shared-message projections', () => {
    const message = {
      iconURL: 'submitted icon',
      userSubmittedPaths: ['/iconURL'],
    };

    expect(getUserSubmittedPathState(message)).toEqual({ paths: [], overflowed: false });
    expect(getUserSubmittedPathState(message, { scope: 'shared_message' })).toEqual({
      paths: ['/iconURL'],
      overflowed: false,
    });
  });

  it('fails closed when unique bounded pointer candidates exceed 256', () => {
    const content = Array.from({ length: 257 }, (_, index) => ({ text: `part-${index}` }));

    const result = getUserSubmittedPathState({
      content,
      userSubmittedPaths: content.map((_, index) => `/content/${index}/text`),
    });

    expect(result.overflowed).toBe(true);
    expect(result.paths).toHaveLength(256);
    expect(result.paths[0]).toBe('/content/0/text');
    expect(result.paths[255]).toBe('/content/255/text');
  });

  it('ignores overlong pointers without weakening effective bounded paths', () => {
    const overlong = `/${'x'.repeat(2048)}`;

    expect(
      getUserSubmittedPathState({
        text: 'submitted text',
        userSubmittedPaths: [overlong, '/text'],
      }),
    ).toEqual({ paths: ['/text'], overflowed: false });
  });

  it('keeps exact HITL field identity separate from generic provenance paths', () => {
    const message = {
      content: [{ tool_call: { output: 'submitted answer' } }],
      userSubmittedMessageFieldPaths: [
        { path: '/content/0/tool_call/output', field: 'answer' },
        { path: '/content/0/tool_call/output', field: 'content_part' },
        { path: '/missing', field: 'decision_reason' },
      ],
    };

    expect(getUserSubmittedPathState(message)).toEqual({ paths: [], overflowed: false });
    expect(getUserSubmittedMessageFieldPathState(message)).toEqual({
      entries: [{ path: '/content/0/tool_call/output', field: 'answer' }],
      overflowed: false,
    });
  });
});
