import type { ProviderFetch } from './transport';
import { createTypeSafeClassifier, resolveEndpoint, toWireQuestion, readAnswer } from './typesafe';

function stubTransport(body: string): {
  transport: ProviderFetch;
  calls: Array<{ url: string; body: string }>;
} {
  const calls: Array<{ url: string; body: string }> = [];
  const transport: ProviderFetch = async (url, init) => {
    calls.push({ url, body: init.body });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => body,
    };
  };
  return { transport, calls };
}

const ANSWER = JSON.stringify({
  model: 'jev-1.13.0',
  answers: { verdict: { type: 'noul', noul: 0.82 } },
  usage: { input_tokens: 120, output_tokens: 8 },
});

describe('resolveEndpoint', () => {
  it('appends the path to a base URL', () => {
    expect(resolveEndpoint('https://api.typesafe.ai/v1')).toBe(
      'https://api.typesafe.ai/v1/systemone',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(resolveEndpoint('https://api.typesafe.ai/v1/')).toBe(
      'https://api.typesafe.ai/v1/systemone',
    );
  });

  it('leaves a URL that already names the path alone', () => {
    expect(resolveEndpoint('https://proxy.internal/systemone')).toBe(
      'https://proxy.internal/systemone',
    );
  });

  it('falls back to the public endpoint', () => {
    expect(resolveEndpoint()).toBe('https://api.typesafe.ai/v1/systemone');
  });
});

describe('toWireQuestion', () => {
  it('renames a boolean question to the name this API uses', () => {
    const wire = toWireQuestion({ type: 'boolean', instructions: 'urgent?' });

    expect(wire).toEqual({ type: 'noul', instructions: 'urgent?' });
  });

  it('carries boolean criteria through', () => {
    const wire = toWireQuestion({
      type: 'boolean',
      instructions: 'urgent?',
      criteria: { true: 'yes means', false: 'no means' },
    });

    expect(wire).toMatchObject({ criteria: { true: 'yes means', false: 'no means' } });
  });

  it('leaves choice and score untouched', () => {
    expect(toWireQuestion({ type: 'choice', instructions: 'q', criteria: { a: null } })).toEqual({
      type: 'choice',
      instructions: 'q',
      criteria: { a: null },
    });
    expect(toWireQuestion({ type: 'score', instructions: 'q', criteria: ['lo', 'hi'] })).toEqual({
      type: 'score',
      instructions: 'q',
      criteria: ['lo', 'hi'],
    });
  });
});

describe('readAnswer', () => {
  it('reads a noul back as a probability', () => {
    expect(readAnswer({ type: 'noul', noul: 0.4 })).toEqual({ type: 'boolean', probability: 0.4 });
  });

  it('reports an unmeasurable confidence as null, not as zero', () => {
    expect(readAnswer({ type: 'choice', choice: 'a', probabilities: { a: 1 } })).toEqual({
      type: 'choice',
      choice: 'a',
      confidence: null,
      probabilities: { a: 1 },
    });
  });

  it('returns null for a shape it does not know', () => {
    expect(readAnswer({ type: 'something_new', value: 2 })).toBeNull();
    expect(readAnswer(null)).toBeNull();
  });
});

describe('createTypeSafeClassifier', () => {
  it('posts to the systemone path and maps the answer back', async () => {
    const { transport, calls } = stubTransport(ANSWER);
    const classifier = createTypeSafeClassifier({ apiKey: 'sk-test', fetch: transport });

    const result = await classifier.classify({
      state: 'payouts are failing',
      questions: { verdict: { type: 'boolean', instructions: 'Is this urgent?' } },
    });

    expect(calls[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(JSON.parse(calls[0].body).questions.verdict.type).toBe('noul');
    expect(result.answers.verdict).toEqual({ type: 'boolean', probability: 0.82 });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 8 });
  });

  it('always sends a model, since this API requires one', async () => {
    const { transport, calls } = stubTransport(ANSWER);
    const classifier = createTypeSafeClassifier({ apiKey: 'sk-test', fetch: transport });

    await classifier.classify({
      state: 'x',
      questions: { verdict: { type: 'boolean', instructions: 'q' } },
    });

    expect(JSON.parse(calls[0].body).model).toBe('jev-latest');
    expect(classifier.id).toBe('typesafe');
  });

  it('honors a configured model and base URL', async () => {
    const { transport, calls } = stubTransport(ANSWER);
    const classifier = createTypeSafeClassifier({
      apiKey: 'sk-test',
      baseURL: 'https://proxy.internal/v1',
      model: 'jev-1.13.0',
      fetch: transport,
    });

    await classifier.classify({
      state: 'x',
      questions: { verdict: { type: 'boolean', instructions: 'q' } },
    });

    expect(calls[0].url).toBe('https://proxy.internal/v1/systemone');
    expect(JSON.parse(calls[0].body).model).toBe('jev-1.13.0');
  });
});
