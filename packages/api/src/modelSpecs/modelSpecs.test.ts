import { EModelEndpoint, ReasoningEffort } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import {
  applyModelSpecPreset,
  findModelSpecByName,
  getModelSpecReasoningOverride,
  isModelSpecEndpointMatch,
  resolveModelSpecPromptPrefixVariables,
  sanitizeModelSpecs,
} from './index';

describe('modelSpecs helpers', () => {
  it('should strip private prompt fields from model spec presets', () => {
    const modelSpecs = {
      enforce: false,
      prioritize: true,
      list: [
        {
          name: 'guarded-spec',
          label: 'Guarded Spec',
          skills: ['private-skill'],
          subagents: { enabled: true, allowSelf: true, agent_ids: ['agent_private'] },
          preset: {
            endpoint: EModelEndpoint.openAI,
            model: 'gpt-4o',
            promptPrefix: 'private prompt prefix',
            instructions: 'private assistant instructions',
            additional_instructions: 'private additional instructions',
            system: 'private bedrock system',
            context: 'private context',
            examples: [{ input: { content: 'a' }, output: { content: 'b' } }],
            greeting: 'Hello',
          },
        },
      ],
    };

    const sanitizedModelSpecs = sanitizeModelSpecs(modelSpecs);
    expect(sanitizedModelSpecs.list[0].subagents).toEqual({
      enabled: true,
      allowSelf: true,
    });
    expect(sanitizedModelSpecs.list[0].preset).toEqual({
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4o',
      greeting: 'Hello',
    });
    expect(sanitizedModelSpecs.list[0]).not.toHaveProperty('skills');
  });

  it('should preserve conversation starters on model specs', () => {
    const modelSpecs = {
      enforce: false,
      prioritize: true,
      list: [
        {
          name: 'starter-spec',
          label: 'Starter Spec',
          conversation_starters: ['Summarize an article', 'Plan my week'],
          preset: {
            endpoint: EModelEndpoint.openAI,
            model: 'gpt-4o',
            promptPrefix: 'private prompt prefix',
          },
        },
      ],
    };

    const sanitizedModelSpecs = sanitizeModelSpecs(modelSpecs);
    expect(sanitizedModelSpecs.list[0].conversation_starters).toEqual([
      'Summarize an article',
      'Plan my week',
    ]);
    expect(sanitizedModelSpecs.list[0].preset).not.toHaveProperty('promptPrefix');
  });

  it('should restore only private fields for non-enforced model specs', () => {
    const modelSpec: TModelSpec = {
      name: 'guarded-openai',
      label: 'Guarded OpenAI',
      iconURL: EModelEndpoint.openAI,
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4o',
        promptPrefix: 'private prompt prefix',
        instructions: 'private instructions',
        additional_instructions: 'private additional instructions',
        temperature: 0.2,
        maxContextTokens: 10000,
        reasoning_effort: ReasoningEffort.high,
      },
    };

    const { parsedBody, appliedPrivateFields } = applyModelSpecPreset({
      modelSpec,
      parsedBody: {
        endpoint: EModelEndpoint.openAI,
        spec: 'guarded-openai',
        model: 'gpt-4o',
        temperature: 0.8,
        reasoning_effort: ReasoningEffort.low,
      },
      endpoint: EModelEndpoint.openAI,
    });

    expect(parsedBody.promptPrefix).toBe('private prompt prefix');
    expect(parsedBody.instructions).toBeUndefined();
    expect(parsedBody.additional_instructions).toBeUndefined();
    expect(parsedBody.temperature).toBe(0.8);
    expect(parsedBody.reasoning_effort).toBe(ReasoningEffort.low);
    expect(parsedBody.maxContextTokens).toBeUndefined();
    expect(parsedBody.iconURL).toBe(EModelEndpoint.openAI);
    expect(appliedPrivateFields.has('promptPrefix')).toBe(true);
  });

  it('should restore preset defaults when model specs are enforced', () => {
    const modelSpec: TModelSpec = {
      name: 'enforced-openai',
      label: 'Enforced OpenAI',
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4o',
        promptPrefix: 'private prompt prefix',
        temperature: 0.2,
        reasoning_effort: ReasoningEffort.high,
      },
    };

    const { parsedBody } = applyModelSpecPreset({
      modelSpec,
      parsedBody: {
        endpoint: EModelEndpoint.openAI,
        spec: 'enforced-openai',
        model: 'client-model',
        temperature: 0.8,
        topP: 0.9,
        reasoning_effort: ReasoningEffort.low,
        chatProjectId: 'project-1',
      },
      endpoint: EModelEndpoint.openAI,
      includePresetDefaults: true,
    });

    expect(parsedBody.spec).toBe('enforced-openai');
    expect(parsedBody.model).toBe('gpt-4o');
    expect(parsedBody.promptPrefix).toBe('private prompt prefix');
    expect(parsedBody.temperature).toBe(0.2);
    expect(parsedBody.reasoning_effort).toBe(ReasoningEffort.high);
    expect(parsedBody.topP).toBeUndefined();
    expect(parsedBody.chatProjectId).toBe('project-1');
  });

  it('should only allow an advertised reasoning override through enforcement', () => {
    const modelSpec: TModelSpec = {
      name: 'enforced-reasoning',
      label: 'Enforced Reasoning',
      reasoning: [ReasoningEffort.low, ReasoningEffort.high],
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'o3',
        reasoning_effort: ReasoningEffort.high,
      },
    };
    const validOverride = getModelSpecReasoningOverride({
      modelSpec,
      requestBody: { reasoning_effort: ReasoningEffort.low },
      endpoint: EModelEndpoint.openAI,
    });

    expect(validOverride).toEqual({ reasoning_effort: ReasoningEffort.low });
    expect(
      getModelSpecReasoningOverride({
        modelSpec,
        requestBody: { reasoning_effort: ReasoningEffort.medium },
        endpoint: EModelEndpoint.openAI,
      }),
    ).toBeUndefined();

    const { parsedBody } = applyModelSpecPreset({
      modelSpec,
      parsedBody: { endpoint: EModelEndpoint.openAI, spec: modelSpec.name },
      reasoningOverride: validOverride,
      endpoint: EModelEndpoint.openAI,
      includePresetDefaults: true,
    });

    expect(parsedBody.reasoning_effort).toBe(ReasoningEffort.low);
  });

  it('should allow Auto to clear an enforced preset reasoning effort', () => {
    const modelSpec: TModelSpec = {
      name: 'enforced-auto-reasoning',
      label: 'Enforced Auto Reasoning',
      reasoning: true,
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'o3',
        reasoning_effort: ReasoningEffort.high,
      },
    };
    const reasoningOverride = getModelSpecReasoningOverride({
      modelSpec,
      requestBody: { reasoning_effort: ReasoningEffort.unset },
      endpoint: EModelEndpoint.openAI,
    });
    const { parsedBody } = applyModelSpecPreset({
      modelSpec,
      parsedBody: { endpoint: EModelEndpoint.openAI, spec: modelSpec.name },
      reasoningOverride,
      endpoint: EModelEndpoint.openAI,
      includePresetDefaults: true,
    });

    expect(reasoningOverride).toEqual({ reasoning_effort: ReasoningEffort.unset });
    expect(parsedBody.reasoning_effort).toBe(ReasoningEffort.unset);
  });

  it('should restore private examples when parser supplies an empty default', () => {
    const examples = [{ input: { content: 'hello' }, output: { content: 'world' } }];
    const modelSpec: TModelSpec = {
      name: 'guarded-google',
      label: 'Guarded Google',
      preset: {
        endpoint: EModelEndpoint.google,
        model: 'gemini-pro',
        examples,
      },
    };

    const { parsedBody } = applyModelSpecPreset({
      modelSpec,
      parsedBody: {
        endpoint: EModelEndpoint.google,
        spec: 'guarded-google',
        model: 'gemini-pro',
      },
      endpoint: EModelEndpoint.google,
    });

    expect(parsedBody.examples).toEqual(examples);
  });

  it('should find specs and validate endpoint matches', () => {
    const modelSpec: TModelSpec = {
      name: 'guarded-openai',
      label: 'Guarded OpenAI',
      preset: {
        endpoint: EModelEndpoint.openAI,
        model: 'gpt-4o',
      },
    };

    expect(findModelSpecByName({ list: [modelSpec] }, 'guarded-openai')).toBe(modelSpec);
    expect(isModelSpecEndpointMatch(modelSpec, EModelEndpoint.openAI)).toBe(true);
    expect(isModelSpecEndpointMatch(modelSpec, EModelEndpoint.google)).toBe(false);
  });

  it('should resolve special variables in model spec prompt prefixes', () => {
    expect(
      resolveModelSpecPromptPrefixVariables({ promptPrefix: 'Help {{current_user}}.' }, {
        name: 'Ada',
      } as never).promptPrefix,
    ).toBe('Help Ada.');
  });
});
