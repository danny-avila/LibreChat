import type { TModelSpec, TUserFavorite, TAgentsMap } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { resolveFavoriteGroups } from '../resolveFavorites';

const openAIEndpoint = {
  value: 'openAI',
  label: 'OpenAI',
  models: [{ name: 'gpt-4o' }, { name: 'gpt-5' }],
} as Endpoint;

const anthropicEndpoint = {
  value: 'anthropic',
  label: 'Anthropic',
  models: [{ name: 'claude-opus-4-20250514' }],
} as Endpoint;

const agentsEndpoint = {
  value: 'agents',
  label: 'Agents',
  models: [{ name: 'agent-1' }],
} as Endpoint;

const modelSpecs: TModelSpec[] = [
  {
    name: 'hermes-3-70b',
    label: 'Hermes 3 70B',
    group: 'OpenRouter',
    preset: { endpoint: 'OpenRouter', model: 'nousresearch/hermes-3-llama-3.1-70b' },
  },
  {
    name: 'ungrouped-spec',
    label: 'Ungrouped Spec',
    preset: { endpoint: 'openAI', model: 'gpt-5' },
  },
];

const agentsMap: TAgentsMap = {
  'agent-1': { id: 'agent-1', name: 'My Agent' } as TAgentsMap[string],
};

const mappedEndpoints: Endpoint[] = [openAIEndpoint, anthropicEndpoint, agentsEndpoint];

describe('resolveFavoriteGroups', () => {
  it('returns an empty array when there are no favorites', () => {
    const groups = resolveFavoriteGroups({
      favorites: [],
      modelSpecs,
      mappedEndpoints,
      agentsMap,
    });
    expect(groups).toEqual([]);
  });

  it('groups a plain model favorite by its endpoint', () => {
    const favorites: TUserFavorite[] = [{ model: 'gpt-4o', endpoint: 'openAI' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('openAI');
    expect(groups[0].label).toBe('OpenAI');
    expect(groups[0].items).toEqual([
      { type: 'model', endpoint: openAIEndpoint, modelId: 'gpt-4o' },
    ]);
  });

  it('groups a spec favorite by its spec.group field', () => {
    const favorites: TUserFavorite[] = [{ spec: 'hermes-3-70b' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('OpenRouter');
    expect(groups[0].label).toBe('OpenRouter');
    expect(groups[0].items).toEqual([{ type: 'spec', spec: modelSpecs[0] }]);
  });

  it('puts a spec favorite with no group field into the Other bucket', () => {
    const favorites: TUserFavorite[] = [{ spec: 'ungrouped-spec' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('__other__');
    expect(groups[0].label).toBe('Other');
    expect(groups[0].items).toEqual([{ type: 'spec', spec: modelSpecs[1] }]);
  });

  it('puts an agent favorite into a single Agents bucket', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'agent-1' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('__agents__');
    expect(groups[0].label).toBe('Agents');
    expect(groups[0].items).toEqual([
      { type: 'model', endpoint: agentsEndpoint, modelId: 'agent-1' },
    ]);
  });

  it('merges multiple favorites from different providers into separate groups, preserving first-seen order', () => {
    const favorites: TUserFavorite[] = [
      { model: 'claude-opus-4-20250514', endpoint: 'anthropic' },
      { model: 'gpt-4o', endpoint: 'openAI' },
      { agentId: 'agent-1' },
    ];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups.map((g) => g.key)).toEqual(['anthropic', 'openAI', '__agents__']);
  });

  it('adds a second model to an existing group rather than creating a duplicate', () => {
    const favorites: TUserFavorite[] = [
      { model: 'gpt-4o', endpoint: 'openAI' },
      { model: 'gpt-5', endpoint: 'openAI' },
    ];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('skips a spec favorite whose spec no longer exists (stale)', () => {
    const favorites: TUserFavorite[] = [{ spec: 'deleted-spec' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips a model favorite whose endpoint no longer exists (stale)', () => {
    const favorites: TUserFavorite[] = [{ model: 'some-model', endpoint: 'removed-endpoint' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips a model favorite whose model is no longer in its endpoint (stale)', () => {
    const favorites: TUserFavorite[] = [{ model: 'gpt-3-ancient', endpoint: 'openAI' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips an agent favorite no longer present in agentsMap (stale)', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'deleted-agent' }];
    const groups = resolveFavoriteGroups({ favorites, modelSpecs, mappedEndpoints, agentsMap });
    expect(groups).toEqual([]);
  });

  it('skips an agent favorite when no agents endpoint is mapped', () => {
    const favorites: TUserFavorite[] = [{ agentId: 'agent-1' }];
    const groups = resolveFavoriteGroups({
      favorites,
      modelSpecs,
      mappedEndpoints: [openAIEndpoint, anthropicEndpoint],
      agentsMap,
    });
    expect(groups).toEqual([]);
  });
});
