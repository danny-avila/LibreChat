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

  it('leaves Google customHeaders untouched (resolved at init, not request time)', () => {
    const llmConfig = {
      customHeaders: {
        'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
        Authorization: 'Bearer ${SOME_KEY}',
      },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user, body });

    // Native Google headers are resolved in initializeGoogle; resolveConfigHeaders
    // must not re-process them (keeps the key-derived auth out of env expansion).
    expect(
      (llmConfig as unknown as { customHeaders: Record<string, string> }).customHeaders,
    ).toEqual({
      'X-Conversation-Id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
      Authorization: 'Bearer ${SOME_KEY}',
    });
  });

  it('resolves each header map only once across repeated calls (idempotent under reuse)', () => {
    process.env.HEADERS_SPEC_IDEMPOTENT = 'env-value';
    const reusedUser = { id: 'u', name: '${HEADERS_SPEC_IDEMPOTENT}' };
    const llmConfig = {
      configuration: { defaultHeaders: { 'X-Name': '{{LIBRECHAT_USER_NAME}}' } },
    } as unknown as RunLLMConfig;

    resolveConfigHeaders({ llmConfig, user: reusedUser, body });
    // Second pass must NOT re-expand the now-substituted ${...} from the user name
    resolveConfigHeaders({ llmConfig, user: reusedUser, body });

    expect(llmConfig.configuration?.defaultHeaders).toEqual({
      'X-Name': '${HEADERS_SPEC_IDEMPOTENT}',
    });
    delete process.env.HEADERS_SPEC_IDEMPOTENT;
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
