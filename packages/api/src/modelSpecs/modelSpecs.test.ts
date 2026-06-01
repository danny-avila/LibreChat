import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import {
  applyModelSpecPreset,
  findModelSpecByName,
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

    expect(sanitizeModelSpecs(modelSpecs).list[0].preset).toEqual({
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4o',
      greeting: 'Hello',
    });
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
      },
    };

    const { parsedBody, appliedPrivateFields } = applyModelSpecPreset({
      modelSpec,
      parsedBody: {
        endpoint: EModelEndpoint.openAI,
        spec: 'guarded-openai',
        model: 'gpt-4o',
        temperature: 0.8,
      },
      endpoint: EModelEndpoint.openAI,
    });

    expect(parsedBody.promptPrefix).toBe('private prompt prefix');
    expect(parsedBody.instructions).toBeUndefined();
    expect(parsedBody.additional_instructions).toBeUndefined();
    expect(parsedBody.temperature).toBe(0.8);
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
      },
    };

    const { parsedBody } = applyModelSpecPreset({
      modelSpec,
      parsedBody: modelSpec.preset,
      endpoint: EModelEndpoint.openAI,
      includePresetDefaults: true,
    });

    expect(parsedBody.spec).toBe('enforced-openai');
    expect(parsedBody.promptPrefix).toBe('private prompt prefix');
    expect(parsedBody.temperature).toBe(0.2);
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
