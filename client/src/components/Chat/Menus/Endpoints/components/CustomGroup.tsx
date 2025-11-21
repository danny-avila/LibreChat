import React from 'react';
import { getEndpointField } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { Endpoint } from '~/common';
import { getIconKey } from '~/utils';
import { icons } from '~/hooks/Endpoint/Icons';
import { CustomMenu as Menu } from '../CustomMenu';
import { ModelSpecItem } from './ModelSpecItem';
import { useModelSelectorContext } from '../ModelSelectorContext';

interface CustomGroupProps {
  groupName: string;
  specs: TModelSpec[];
  endpoints: Endpoint[];
}

export function CustomGroup({ groupName, specs, endpoints }: CustomGroupProps) {
  const { selectedValues, endpointsConfig } = useModelSelectorContext();
  const { modelSpec: selectedSpec } = selectedValues;

  if (!specs || specs.length === 0) {
    return null;
  }

  let icon = endpoints.find((e) => {
    const normalizedGroup = groupName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedValue = e.value?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedLabel = e.label?.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedGroup === normalizedValue || normalizedGroup === normalizedLabel;
  })?.icon;

  if (!icon && endpointsConfig) {
    const normalizedGroup = groupName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchKey = Object.keys(endpointsConfig).find(
      (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedGroup,
    );

    if (matchKey) {
      const endpointType = getEndpointField(endpointsConfig, matchKey, 'type');
      const iconKey = getIconKey({ endpoint: matchKey, endpointsConfig, endpointType });
      const Icon = icons[iconKey];
      const endpointIconURL = getEndpointField(endpointsConfig, matchKey, 'iconURL');

      if (Icon) {
        icon = (
          <Icon
            size={20}
            className="text-text-primary shrink-0 icon-md"
            iconURL={endpointIconURL}
            endpoint={matchKey}
          />
        );
      }
    }
  }

  return (
    <Menu
      id={`custom-group-${groupName}-menu`}
      key={`custom-group-${groupName}`}
      className="transition-opacity duration-200 ease-in-out"
      label={
        <div className="group flex w-full flex-shrink cursor-pointer items-center justify-between rounded-xl px-1 py-1 text-sm">
          <div className="flex items-center gap-2">
            {icon && (
              <div className="flex flex-shrink-0 items-center justify-center overflow-hidden">
                {icon}
              </div>
            )}
            <span className="truncate text-left">{groupName}</span>
          </div>
        </div>
      }
    >
      {specs.map((spec: TModelSpec) => (
        <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
      ))}
    </Menu>
  );
}

export function renderCustomGroups(modelSpecs: TModelSpec[], mappedEndpoints: Endpoint[]) {
  // Get all endpoint values to exclude them from custom groups
  const endpointValues = new Set(mappedEndpoints.map((ep) => ep.value));

  // Group specs by their group field (excluding endpoint-matched groups and ungrouped)
  const customGroups = modelSpecs.reduce(
    (acc, spec) => {
      if (!spec.group || endpointValues.has(spec.group)) {
        return acc;
      }
      if (!acc[spec.group]) {
        acc[spec.group] = [];
      }
      acc[spec.group].push(spec);
      return acc;
    },
    {} as Record<string, TModelSpec[]>,
  );

  // Render each custom group
  return Object.entries(customGroups).map(([groupName, specs]) => (
    <CustomGroup
      key={groupName}
      groupName={groupName}
      specs={specs}
      endpoints={mappedEndpoints}
    />
  ));
}
