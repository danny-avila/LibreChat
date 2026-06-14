import type { RunLLMConfig } from '~/types';
import { mergeHeaders, resolveConfigHeaders } from './headers';

describe('mergeHeaders', () => {
  it('returns undefined when neither side has headers', () => {
    expect(mergeHeaders(undefined, undefined)).toBeUndefined();
  });

  it('returns a copy of the side that is present', () => {
    expect(mergeHeaders({ a: '1' }, undefined)).toEqual({ a: '1' });
    expect(mergeHeaders(undefined, { b: '2' })).toEqual({ b: '2' });
  });

  it('lets override win on key collisions', () => {
    expect(mergeHeaders({ a: 'base', b: 'base' }, { b: 'override' })).toEqual({
      a: 'base',
      b: 'override',
    });
  });

  it('comma-unions anthropic-beta values from both sides (deduped)', () => {
    const merged = mergeHeaders(
      { 'anthropic-beta': 'custom-beta, shared' },
      { 'anthropic-beta': 'shared,managed-beta' },
    );
    expect(merged?.['anthropic-beta']).toBe('custom-beta,shared,managed-beta');
  });

  it('does not mutate the input objects', () => {
    const base = { a: '1' };
    const override = { b: '2' };
    mergeHeaders(base, override);
    expect(base).toEqual({ a: '1' });
    expect(override).toEqual({ b: '2' });
  });

  it('replaces a case-variant base key with the override (no duplicate header names)', () => {
    const merged = mergeHeaders({ authorization: 'custom' }, { Authorization: 'Bearer managed' });
    expect(merged).toEqual({ Authorization: 'Bearer managed' });
  });

  it('unions anthropic-beta case-insensitively, keeping the override casing', () => {
    const merged = mergeHeaders(
      { 'anthropic-beta': 'custom-beta' },
      { 'Anthropic-Beta': 'managed-beta' },
    );
    expect(merged).toEqual({ 'Anthropic-Beta': 'custom-beta,managed-beta' });
  });
});

describe('resolveConfigHeaders', () => {
  const user = { id: 'user-123', email: 'person@example.com' };
  const body = { conversationId: 'convo-abc' };

  it('is a no-op when llmConfig is null/undefined', () => {
    expect(() => resolveConfigHeaders({ llmConfig: null, user, body })).not.toThrow();
    expect(() => resolveConfigHeaders({ llmConfig: undefined, user, body })).not.toThrow();
  });

  it('resolves OpenAI-style configuration.defaultHeaders', () => {
    const llmConfig = {
      configuration: {
        defaultHeaders: {
          'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
          'X-User-Id': '{{LIBRECHAT_USER_ID}}',
        },
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    expect(llmConfig.configuration?.defaultHeaders).toEqual({
      'X-Conversation-Id': 'convo-abc',
      'X-User-Id': 'user-123',
    });
  });

  it('resolves Anthropic-style clientOptions.defaultHeaders while preserving non-placeholder values', () => {
    const llmConfig = {
      clientOptions: {
        defaultHeaders: {
          'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
          'cf-aig-metadata': '{"conversation_id":"{{LIBRECHAT_BODY_CONVERSATIONID}}"}',
        },
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    const clientOptions = (
      llmConfig as unknown as { clientOptions: { defaultHeaders: Record<string, string> } }
    ).clientOptions;
    expect(clientOptions.defaultHeaders).toEqual({
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
      'cf-aig-metadata': '{"conversation_id":"convo-abc"}',
    });
  });

  it('resolves Google-style customHeaders', () => {
    const llmConfig = {
      customHeaders: {
        'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
        Authorization: 'Bearer static-token',
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    expect(
      (llmConfig as unknown as { customHeaders: Record<string, string> }).customHeaders,
    ).toEqual({
      'X-Conversation-Id': 'convo-abc',
      Authorization: 'Bearer static-token',
    });
  });

  it('does not env-expand the provider-managed Google Authorization header', () => {
    process.env.HEADERS_SPEC_SECRET = 'server-secret';
    const llmConfig = {
      customHeaders: {
        Authorization: 'Bearer ${HEADERS_SPEC_SECRET}',
        'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    const customHeaders = (llmConfig as unknown as { customHeaders: Record<string, string> })
      .customHeaders;
    /** Auth header (built from a possibly user-provided key) is left untouched */
    expect(customHeaders.Authorization).toBe('Bearer ${HEADERS_SPEC_SECRET}');
    /** Admin metadata headers still resolve */
    expect(customHeaders['X-Conversation-Id']).toBe('convo-abc');
    delete process.env.HEADERS_SPEC_SECRET;
  });

  it('resolves env-var placeholders in header values', () => {
    process.env.HEADERS_SPEC_GATEWAY_KEY = 'secret-key';
    const llmConfig = {
      configuration: {
        defaultHeaders: { 'X-Gateway-Key': '${HEADERS_SPEC_GATEWAY_KEY}' },
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    expect(llmConfig.configuration?.defaultHeaders).toEqual({ 'X-Gateway-Key': 'secret-key' });
    delete process.env.HEADERS_SPEC_GATEWAY_KEY;
  });

  it('leaves configs without header maps untouched', () => {
    const llmConfig = { model: 'gpt-4o', configuration: {} } as unknown as RunLLMConfig;
    expect(() => resolveConfigHeaders({ llmConfig, user, body })).not.toThrow();
    expect(llmConfig.configuration).toEqual({});
  });
});
