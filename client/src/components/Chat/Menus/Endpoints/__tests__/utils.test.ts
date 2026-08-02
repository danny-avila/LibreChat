import type { TModelSpec } from 'librechat-data-provider';
import type { useLocalize } from '~/hooks';
import type { Endpoint } from '~/common';
import { filterItems, getSpecModelIds } from '../utils';

const makeSpec = (overrides: Partial<TModelSpec>): TModelSpec =>
  ({
    name: 'spec',
    label: 'Spec',
    preset: { endpoint: 'openAI', model: 'gpt-4o' },
    ...overrides,
  }) as TModelSpec;

const agentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  showMarketplace: true,
  searchAliases: ['agent marketplace', 'marketplace'],
};

const disabledAgentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: false,
  icon: null,
};

describe('model selector utilities', () => {
  it('matches endpoint search aliases', () => {
    const results = filterItems([agentsEndpoint], 'marketplace', undefined, undefined);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('matches localized Marketplace labels', () => {
    const localize = ((key: string) => {
      if (key === 'com_agents_marketplace') {
        return 'Tienda de Agentes';
      }
      if (key === 'com_ui_marketplace') {
        return 'Tienda';
      }
      return key;
    }) as ReturnType<typeof useLocalize>;

    const results = filterItems([agentsEndpoint], 'tienda', undefined, undefined, localize);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('does not match agents when there are no selectable agent options', () => {
    const results = filterItems([disabledAgentsEndpoint], 'my agents', undefined, undefined);
    expect(results).toEqual([]);
  });
});

describe('getSpecModelIds', () => {
  it('returns the underlying model ids referenced by the specs', () => {
    const specs = [
      makeSpec({ name: 'a', preset: { endpoint: 'openAI', model: 'gpt-4o' } }),
      makeSpec({ name: 'b', preset: { endpoint: 'openAI', model: 'gpt-4o-mini' } }),
    ];
    expect(getSpecModelIds(specs)).toEqual(new Set(['gpt-4o', 'gpt-4o-mini']));
  });

  it('ignores specs whose preset has no model', () => {
    const specs = [makeSpec({ name: 'agent', preset: { endpoint: 'agents', agent_id: 'a_1' } })];
    expect(getSpecModelIds(specs).size).toBe(0);
  });

  it('returns an empty set for no specs', () => {
    expect(getSpecModelIds([]).size).toBe(0);
  });
});
