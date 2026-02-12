import { resolveSummarizationLLMConfig } from './summarize';

describe('resolveSummarizationLLMConfig', () => {
  it('returns disabled with empty parameters when no config provided', () => {
    const resolved = resolveSummarizationLLMConfig({ agentId: 'agent_1' });
    expect(resolved.enabled).toBe(false);
    expect(resolved.parameters).toEqual({});
  });

  it('returns disabled when globalConfig is not an object', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: null as unknown as undefined,
    });
    expect(resolved.enabled).toBe(false);
  });

  it('resolves global config with provider/model/prompt', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: {
        enabled: true,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        parameters: { temperature: 0.2 },
        prompt: 'Summarize this conversation.',
      },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-5');
    expect(resolved.parameters.temperature).toBe(0.2);
    expect(resolved.prompt).toBe('Summarize this conversation.');
  });

  it('requires provider, model, and prompt to be enabled', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
      },
    });
    expect(resolved.enabled).toBe(false);
  });

  it('uses agent runtime config as fallback for provider/model', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: { enabled: true, prompt: 'Summarize.' },
      agentRuntimeConfig: { provider: 'google', model: 'gemini-2.5-flash' },
    });
    expect(resolved.provider).toBe('google');
    expect(resolved.model).toBe('gemini-2.5-flash');
    expect(resolved.enabled).toBe(true);
  });

  it('per-agent override takes highest precedence', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_special',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Global prompt.',
        agents: {
          agent_special: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            prompt: 'Agent-specific prompt',
          },
        },
      },
      agentRuntimeConfig: { provider: 'google', model: 'gemini-2.5-flash' },
    });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toBe('claude-sonnet-4-5');
    expect(resolved.prompt).toBe('Agent-specific prompt');
  });

  it('per-agent override can disable summarization', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_disabled',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Summarize.',
        agents: {
          agent_disabled: { enabled: false },
        },
      },
    });
    expect(resolved.enabled).toBe(false);
  });

  it('merges parameters from global and per-agent override', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Summarize.',
        parameters: { temperature: 0.5, top_p: 0.9 },
        agents: {
          agent_1: {
            parameters: { temperature: 0.2 },
          },
        },
      },
    });
    expect(resolved.parameters).toEqual({ temperature: 0.2, top_p: 0.9 });
  });

  it('passes trigger from global config', () => {
    const resolved = resolveSummarizationLLMConfig({
      agentId: 'agent_1',
      globalConfig: {
        enabled: true,
        provider: 'openAI',
        model: 'gpt-4.1-mini',
        prompt: 'Summarize.',
        trigger: { type: 'token_ratio', value: 0.8 },
      },
    });
    expect(resolved.trigger).toEqual({ type: 'token_ratio', value: 0.8 });
  });
});
