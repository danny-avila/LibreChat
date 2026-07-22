import React from 'react';
import { useFavorites, useLocalize } from '~/hooks';
import { useModelSelectorContext } from '../ModelSelectorContext';
import {
  resolveFavoriteGroups,
  AGENTS_GROUP_KEY,
  OTHER_GROUP_KEY,
  type FavoriteGroup,
} from '../resolveFavorites';
import { ModelSpecItem } from './ModelSpecItem';
import { EndpointModelItem } from './EndpointModelItem';
import GroupMenu from './GroupMenu';

/**
 * `group.label` is raw provider-name data (e.g. `endpoint.label`, or the
 * admin-configured `spec.group` string) for every real provider bucket, so
 * it's rendered as-is. The two synthetic buckets ("Agents"/"Other") are UI
 * copy this feature introduces, not data, so those two specifically must
 * go through localization instead of using `group.label` verbatim.
 */
function getGroupDisplayLabel(
  group: FavoriteGroup,
  localize: ReturnType<typeof useLocalize>,
): string {
  if (group.key === AGENTS_GROUP_KEY) {
    return localize('com_ui_favorites_agents_group');
  }
  if (group.key === OTHER_GROUP_KEY) {
    return localize('com_ui_favorites_other_group');
  }
  return group.label;
}

export function FavoritesSection() {
  const localize = useLocalize();
  const { favorites } = useFavorites();
  const { modelSpecs, mappedEndpoints, agentsMap, selectedValues } = useModelSelectorContext();

  const groups = resolveFavoriteGroups({
    favorites,
    modelSpecs,
    mappedEndpoints,
    agentsMap,
  });

  if (groups.length === 0) {
    return null;
  }

  return (
    <GroupMenu id="favorites-menu" groupName={localize('com_ui_my_favorites')}>
      {groups.map((group) => (
        <div key={group.key} className="px-2 py-1">
          <div className="px-1 py-1 text-xs font-medium text-text-secondary">
            {getGroupDisplayLabel(group, localize)}
          </div>
          {group.items.map((item) =>
            item.type === 'spec' ? (
              <ModelSpecItem
                key={`fav-spec-${item.spec.name}`}
                spec={item.spec}
                isSelected={selectedValues.modelSpec === item.spec.name}
              />
            ) : (
              <EndpointModelItem
                key={`fav-model-${item.endpoint.value}-${item.modelId}`}
                modelId={item.modelId}
                endpoint={item.endpoint}
              />
            ),
          )}
        </div>
      ))}
    </GroupMenu>
  );
}
