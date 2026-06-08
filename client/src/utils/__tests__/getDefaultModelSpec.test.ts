import { EModelEndpoint, LocalStorageKeys } from 'librechat-data-provider';
import type { TModelSpec, TStartupConfig } from 'librechat-data-provider';
import { getDefaultModelSpec } from '../endpoints';

const createModelSpec = (name: string, overrides: Partial<TModelSpec> = {}): TModelSpec =>
  ({
    name,
    label: name,
    preset: {
      endpoint: EModelEndpoint.openAI,
      model: name,
    },
    ...overrides,
  }) as TModelSpec;

const createStartupConfig = (list: TModelSpec[]): TStartupConfig =>
  ({
    interface: {
      modelSelect: true,
    },
    modelSpecs: {
      prioritize: true,
      list,
    },
  }) as TStartupConfig;

describe('getDefaultModelSpec', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the soft default for a fresh user with no prior selection', () => {
    const regularSpec = createModelSpec('regular-spec');
    const softSpec = createModelSpec('soft-spec', { softDefault: true });

    const result = getDefaultModelSpec(createStartupConfig([regularSpec, softSpec]));

    expect(result).toEqual({ softDefault: softSpec });
  });

  it('keeps the last selected spec before applying the soft default', () => {
    const lastSpec = createModelSpec('last-spec');
    const softSpec = createModelSpec('soft-spec', { softDefault: true });
    localStorage.setItem(LocalStorageKeys.LAST_SPEC, lastSpec.name);

    const result = getDefaultModelSpec(createStartupConfig([softSpec, lastSpec]));

    expect(result).toEqual({ last: lastSpec });
  });

  it('does not apply the soft default when a prior model selection exists', () => {
    const softSpec = createModelSpec('soft-spec', { softDefault: true });
    localStorage.setItem(
      LocalStorageKeys.LAST_MODEL,
      JSON.stringify({ [EModelEndpoint.openAI]: 'gpt-4o' }),
    );

    const result = getDefaultModelSpec(createStartupConfig([softSpec]));

    expect(result).toBeUndefined();
  });

  it('does not apply the soft default when a prior agent selection exists', () => {
    const softSpec = createModelSpec('soft-spec', { softDefault: true });
    localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}0`, 'agent_123');

    const result = getDefaultModelSpec(createStartupConfig([softSpec]));

    expect(result).toBeUndefined();
  });

  it('keeps hard admin defaults ahead of user history and soft defaults', () => {
    const hardSpec = createModelSpec('hard-spec', { default: true });
    const softSpec = createModelSpec('soft-spec', { softDefault: true });
    localStorage.setItem(LocalStorageKeys.LAST_SPEC, softSpec.name);

    const result = getDefaultModelSpec(createStartupConfig([softSpec, hardSpec]));

    expect(result).toEqual({ default: hardSpec });
  });

  it('preserves the legacy first-spec fallback when no soft default is configured', () => {
    const firstSpec = createModelSpec('first-spec');
    const secondSpec = createModelSpec('second-spec');

    const result = getDefaultModelSpec(createStartupConfig([firstSpec, secondSpec]));

    expect(result).toEqual({ default: firstSpec });
  });
});
