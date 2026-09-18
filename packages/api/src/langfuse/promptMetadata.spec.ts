import type { AppConfig } from '@librechat/data-schemas';
import { buildLangfuseConfig } from './config';

describe('resolved prompt trace metadata', () => {
  const prompt = {
    source: 'langfuse' as const,
    name: 'support-policy',
    version: 4,
    cached: true,
  };

  beforeEach(() => {
    process.env.LANGFUSE_TRACING_ENABLED = 'false';
  });

  afterEach(() => {
    delete process.env.LANGFUSE_TRACING_ENABLED;
  });

  it('does not export prompt identity by default', () => {
    const result = buildLangfuseConfig({ prompt });

    expect(result.librechatTraceAttributes).toBeUndefined();
  });

  it('exports identity but never content after explicit operator opt-in', () => {
    const result = buildLangfuseConfig({
      appConfig: {
        langfuse: { trace: { promptMetadata: true } },
      } as unknown as AppConfig,
      prompt,
    });

    expect(result.librechatTraceAttributes).toEqual({
      'librechat.prompt.source': 'langfuse',
      'librechat.prompt.name': 'support-policy',
      'librechat.prompt.version': 4,
      'librechat.prompt.cached': true,
    });
    expect(JSON.stringify(result)).not.toContain('prompt content');
  });
});
