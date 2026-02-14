import { EModelEndpoint } from 'librechat-data-provider';
import cleanupPreset from '../cleanupPreset';

/**
 * Integration tests for cleanupPreset — NO mocks.
 * Uses the real parseConvo to verify actual schema behavior
 * with defaultParamsEndpoint for custom endpoints.
 */
describe('cleanupPreset - real parsing with defaultParamsEndpoint', () => {
  it('should preserve maxOutputTokens when defaultParamsEndpoint is anthropic', () => {
    const preset = {
      presetId: 'test-id',
      title: 'Claude Opus',
      endpoint: 'AnthropicClaude',
      endpointType: EModelEndpoint.custom,
      model: 'anthropic/claude-opus-4.5',
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.9,
      maxContextTokens: 50000,
    };

    const result = cleanupPreset({
      preset,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result.maxOutputTokens).toBe(8192);
    expect(result.topP).toBe(0.9);
    expect(result.temperature).toBe(0.7);
    expect(result.maxContextTokens).toBe(50000);
    expect(result.model).toBe('anthropic/claude-opus-4.5');
  });

  it('should strip maxOutputTokens without defaultParamsEndpoint (OpenAI schema)', () => {
    const preset = {
      presetId: 'test-id',
      title: 'GPT Custom',
      endpoint: 'MyOpenRouter',
      endpointType: EModelEndpoint.custom,
      model: 'gpt-4o',
      temperature: 0.7,
      maxOutputTokens: 8192,
      max_tokens: 4096,
    };

    const result = cleanupPreset({ preset });

    expect(result.maxOutputTokens).toBeUndefined();
    expect(result.max_tokens).toBe(4096);
    expect(result.temperature).toBe(0.7);
  });

  it('should strip OpenAI-specific fields when using anthropic params', () => {
    const preset = {
      presetId: 'test-id',
      title: 'Claude Custom',
      endpoint: 'AnthropicClaude',
      endpointType: EModelEndpoint.custom,
      model: 'anthropic/claude-3-opus',
      max_tokens: 4096,
      top_p: 0.9,
      presence_penalty: 0.5,
      frequency_penalty: 0.3,
      temperature: 0.7,
    };

    const result = cleanupPreset({
      preset,
      defaultParamsEndpoint: EModelEndpoint.anthropic,
    });

    expect(result.max_tokens).toBeUndefined();
    expect(result.top_p).toBeUndefined();
    expect(result.presence_penalty).toBeUndefined();
    expect(result.frequency_penalty).toBeUndefined();
    expect(result.temperature).toBe(0.7);
  });

  it('should not carry bedrock region to custom endpoint', () => {
    const preset = {
      presetId: 'test-id',
      title: 'Custom',
      endpoint: 'MyEndpoint',
      endpointType: EModelEndpoint.custom,
      model: 'gpt-4o',
      temperature: 0.7,
      region: 'us-east-1',
    };

    const result = cleanupPreset({ preset });

    expect(result.region).toBeUndefined();
    expect(result.temperature).toBe(0.7);
  });

  it('should preserve Google-specific fields when defaultParamsEndpoint is google', () => {
    const preset = {
      presetId: 'test-id',
      title: 'Gemini Custom',
      endpoint: 'MyGoogleEndpoint',
      endpointType: EModelEndpoint.custom,
      model: 'gemini-pro',
      temperature: 0.7,
      maxOutputTokens: 8192,
      topP: 0.9,
      topK: 40,
    };

    const result = cleanupPreset({
      preset,
      defaultParamsEndpoint: EModelEndpoint.google,
    });

    expect(result.maxOutputTokens).toBe(8192);
    expect(result.topP).toBe(0.9);
    expect(result.topK).toBe(40);
  });
});
