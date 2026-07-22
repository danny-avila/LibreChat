import { isAgentsEndpoint } from 'librechat-data-provider';
import type { TModelSpec, TUserFavorite, TAgentsMap } from 'librechat-data-provider';
import type { Endpoint } from '~/common';

export type ResolvedFavoriteItem =
  | { type: 'spec'; spec: TModelSpec }
  | { type: 'model'; endpoint: Endpoint; modelId: string };

export interface FavoriteGroup {
  key: string;
  label: string;
  items: ResolvedFavoriteItem[];
}

/**
 * Keys for the two synthetic (non-provider) buckets. The `label` this module
 * assigns them is an internal fallback only — components rendering these
 * groups must localize the displayed text via `useLocalize()` when the key
 * matches one of these two constants, since "Agents"/"Other" are UI copy,
 * not provider-name data (unlike every other group's label, which comes
 * from `endpoint.label` or the admin-configured `spec.group` string).
 */
export const OTHER_GROUP_KEY = '__other__';
const OTHER_GROUP_LABEL = 'Other';
export const AGENTS_GROUP_KEY = '__agents__';
const AGENTS_GROUP_LABEL = 'Agents';

export function resolveFavoriteGroups({
  favorites,
  modelSpecs,
  mappedEndpoints,
  agentsMap,
}: {
  favorites: TUserFavorite[];
  modelSpecs: TModelSpec[];
  mappedEndpoints: Endpoint[];
  agentsMap: TAgentsMap | undefined;
}): FavoriteGroup[] {
  const groupsByKey = new Map<string, FavoriteGroup>();

  const addItem = (key: string, label: string, item: ResolvedFavoriteItem) => {
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groupsByKey.set(key, { key, label, items: [item] });
  };

  for (const favorite of favorites) {
    if (favorite.spec) {
      const spec = modelSpecs.find((s) => s.name === favorite.spec);
      if (!spec) {
        continue;
      }
      const key = spec.group ?? OTHER_GROUP_KEY;
      const label = spec.group ?? OTHER_GROUP_LABEL;
      addItem(key, label, { type: 'spec', spec });
      continue;
    }

    if (favorite.agentId) {
      const agentsEndpoint = mappedEndpoints.find((endpoint) => isAgentsEndpoint(endpoint.value));
      if (!agentsEndpoint || !agentsMap?.[favorite.agentId]) {
        continue;
      }
      addItem(AGENTS_GROUP_KEY, AGENTS_GROUP_LABEL, {
        type: 'model',
        endpoint: agentsEndpoint,
        modelId: favorite.agentId,
      });
      continue;
    }

    if (favorite.model && favorite.endpoint) {
      const endpoint = mappedEndpoints.find((e) => e.value === favorite.endpoint);
      if (!endpoint) {
        continue;
      }
      const modelExists = endpoint.models?.some((m) => m.name === favorite.model);
      if (!modelExists) {
        continue;
      }
      addItem(endpoint.value, endpoint.label || endpoint.value, {
        type: 'model',
        endpoint,
        modelId: favorite.model,
      });
    }
  }

  return Array.from(groupsByKey.values());
}
