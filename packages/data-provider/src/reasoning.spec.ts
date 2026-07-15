import type { TModelSpec } from './models';
import {
  createModelSpecReasoningOverride,
  getModelSpecReasoningValue,
  resolveModelSpecReasoning,
  supportsGoogleThinkingLevel,
} from './reasoning';
import { AnthropicEffort, EModelEndpoint, ReasoningEffort, ThinkingLevel } from './schemas';
import { tModelSpecSchema } from './models';

function createModelSpec(
  endpoint: string,
  model: string,
  reasoning: TModelSpec['reasoning'] = true,
): TModelSpec {
  return {
    name: `${endpoint}-${model}`,
    label: model,
    reasoning,
    preset: { endpoint, model },
  };
}

describe('model spec reasoning', () => {
  it('accepts the opt-in flag and restricted option lists in model spec config', () => {
    const baseSpec = createModelSpec(EModelEndpoint.openAI, 'o3');

    expect(tModelSpecSchema.parse(baseSpec).reasoning).toBe(true);
    expect(tModelSpecSchema.parse({ ...baseSpec, reasoning: ['low', 'high'] }).reasoning).toEqual([
      'low',
      'high',
    ]);
    expect(tModelSpecSchema.safeParse({ ...baseSpec, reasoning: [] }).success).toBe(false);
  });

  it('stays hidden unless the model spec opts in', () => {
    const modelSpec = createModelSpec(EModelEndpoint.openAI, 'o3', false);

    expect(
      resolveModelSpecReasoning({ modelSpec, endpoint: EModelEndpoint.openAI }),
    ).toBeUndefined();
  });

  it('uses the standard OpenAI options and supports a restricted subset', () => {
    const modelSpec = createModelSpec(EModelEndpoint.openAI, 'o3');
    const standard = resolveModelSpecReasoning({ modelSpec, endpoint: EModelEndpoint.openAI });

    expect(standard?.key).toBe('reasoning_effort');
    expect(standard?.options).toEqual(Object.values(ReasoningEffort));
    expect(standard?.defaultValue).toBe(ReasoningEffort.unset);

    const azure = resolveModelSpecReasoning({
      modelSpec: createModelSpec(EModelEndpoint.azureOpenAI, 'o3'),
      endpoint: EModelEndpoint.azureOpenAI,
    });
    expect(azure?.key).toBe('reasoning_effort');
    expect(azure?.options).toEqual(Object.values(ReasoningEffort));

    modelSpec.reasoning = [
      ReasoningEffort.low,
      'invalid',
      ReasoningEffort.high,
      ReasoningEffort.low,
    ];
    modelSpec.preset.reasoning_effort = ReasoningEffort.high;
    const restricted = resolveModelSpecReasoning({
      modelSpec,
      endpoint: EModelEndpoint.openAI,
    });

    expect(restricted?.options).toEqual([ReasoningEffort.low, ReasoningEffort.high]);
    expect(restricted?.defaultValue).toBe(ReasoningEffort.high);
    expect(getModelSpecReasoningValue(restricted!, null)).toBe(ReasoningEffort.high);
    expect(getModelSpecReasoningValue(restricted!, { reasoning_effort: ReasoningEffort.low })).toBe(
      ReasoningEffort.low,
    );
  });

  it('uses effort for adaptive Anthropic models and budget choices for older models', () => {
    const adaptiveModelSpec = createModelSpec(EModelEndpoint.anthropic, 'claude-sonnet-4-6');
    adaptiveModelSpec.preset.thinkingBudget = 4096;
    const adaptive = resolveModelSpecReasoning({
      modelSpec: adaptiveModelSpec,
      endpoint: EModelEndpoint.anthropic,
    });
    const legacy = resolveModelSpecReasoning({
      modelSpec: createModelSpec(EModelEndpoint.anthropic, 'claude-3-7-sonnet', [512, 1024, 4096]),
      endpoint: EModelEndpoint.anthropic,
    });

    expect(adaptive?.key).toBe('effort');
    expect(adaptive?.options).toEqual(Object.values(AnthropicEffort));
    expect(legacy).toMatchObject({ key: 'thinkingBudget', options: [1024, 4096] });
  });

  it('uses levels for modern Google models and budget choices for older models', () => {
    expect(supportsGoogleThinkingLevel('gemini-3-pro-preview')).toBe(true);
    expect(supportsGoogleThinkingLevel('gemma-4-27b')).toBe(true);
    expect(supportsGoogleThinkingLevel('gemini-2.5-pro')).toBe(false);

    const modernModelSpec = createModelSpec(EModelEndpoint.google, 'gemini-3-pro-preview');
    modernModelSpec.preset.thinkingBudget = 1024;
    const modern = resolveModelSpecReasoning({
      modelSpec: modernModelSpec,
      endpoint: EModelEndpoint.google,
    });
    const legacy = resolveModelSpecReasoning({
      modelSpec: createModelSpec(EModelEndpoint.google, 'gemini-2.5-pro', [-1, 1024]),
      endpoint: EModelEndpoint.google,
    });

    expect(modern?.key).toBe('thinkingLevel');
    expect(modern?.options).toEqual(Object.values(ThinkingLevel));
    expect(legacy).toMatchObject({ key: 'thinkingBudget', options: [-1, 1024] });
  });

  it('uses a custom endpoint default parameter family and custom definitions', () => {
    const modelSpec = createModelSpec('my-openai-compatible-endpoint', 'reasoner');
    const setting = resolveModelSpecReasoning({
      modelSpec,
      endpoint: 'my-openai-compatible-endpoint',
      defaultParamsEndpoint: EModelEndpoint.openAI,
      paramDefinitions: [
        {
          key: 'reasoning_effort',
          component: 'slider',
          type: 'enum',
          options: [ReasoningEffort.low, ReasoningEffort.high],
          default: ReasoningEffort.low,
        },
      ],
    });

    expect(setting).toMatchObject({
      key: 'reasoning_effort',
      options: [ReasoningEffort.low, ReasoningEffort.high],
      defaultValue: ReasoningEffort.low,
    });

    const budgetSetting = resolveModelSpecReasoning({
      modelSpec: createModelSpec('my-budget-endpoint', 'reasoner', [1024, 4096]),
      endpoint: 'my-budget-endpoint',
      defaultParamsEndpoint: EModelEndpoint.openAI,
      paramDefinitions: [
        {
          key: 'thinkingBudget',
          component: 'input',
          type: 'number',
          range: { min: 1024, max: 8192 },
        },
      ],
    });
    expect(budgetSetting).toMatchObject({
      key: 'thinkingBudget',
      options: [1024, 4096],
    });
  });

  it.each([
    EModelEndpoint.agents,
    EModelEndpoint.assistants,
    EModelEndpoint.azureAssistants,
    EModelEndpoint.bedrock,
  ])('does not expose the selector for %s', (endpoint) => {
    expect(
      resolveModelSpecReasoning({ modelSpec: createModelSpec(endpoint, 'model'), endpoint }),
    ).toBeUndefined();
  });

  it('only creates provider overrides advertised by the setting', () => {
    const setting = resolveModelSpecReasoning({
      modelSpec: createModelSpec(EModelEndpoint.openAI, 'o3', [ReasoningEffort.low]),
      endpoint: EModelEndpoint.openAI,
    });

    expect(createModelSpecReasoningOverride(setting!, ReasoningEffort.low)).toEqual({
      reasoning_effort: ReasoningEffort.low,
    });
    expect(createModelSpecReasoningOverride(setting!, ReasoningEffort.high)).toBeUndefined();
  });
});
