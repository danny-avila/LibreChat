import { buildOneCodeLLMConfig, buildOneCodeModelKwargs } from './onecode';

describe('buildOneCodeModelKwargs', () => {
  it('injects the selected workspace into OpenAI-compatible metadata', () => {
    expect(buildOneCodeModelKwargs(undefined, { workspace: ' /tmp/project-a ' })).toEqual({
      metadata: { workspace: '/tmp/project-a' },
    });
  });

  it('preserves existing model kwargs and metadata fields', () => {
    expect(
      buildOneCodeModelKwargs(
        { max_completion_tokens: 1024, metadata: { trace: 'abc' } },
        { workspace: '/tmp/project-a' },
      ),
    ).toEqual({
      max_completion_tokens: 1024,
      metadata: {
        trace: 'abc',
        workspace: '/tmp/project-a',
      },
    });
  });

  it('does not create metadata when no workspace is selected', () => {
    const modelKwargs = { max_completion_tokens: 1024 };
    expect(buildOneCodeModelKwargs(modelKwargs, { workspace: '   ' })).toBe(modelKwargs);
  });
});

describe('buildOneCodeLLMConfig', () => {
  it('forces OneCode outer retries to zero', () => {
    expect(
      buildOneCodeLLMConfig({ model: 'onecode-agent', maxRetries: 6 }, undefined),
    ).toMatchObject({
      model: 'onecode-agent',
      maxRetries: 0,
    });
  });
});
