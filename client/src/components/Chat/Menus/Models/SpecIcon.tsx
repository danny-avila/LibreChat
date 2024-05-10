import React from 'react';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import { getModelSpecIconURL, getIconKey, getEndpointField } from '~/utils';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';

interface SpecIconProps {
  currentSpec: TModelSpec;
  endpointsConfig: TEndpointsConfig;
}

const SpecIcon: React.FC<SpecIconProps> = ({ currentSpec, endpointsConfig }) => {
  const iconURL = getModelSpecIconURL(currentSpec);
  const { endpoint } = currentSpec.preset;
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointIconURL });
  let Icon: (props: IconMapProps) => React.JSX.Element;

  if (!iconURL?.includes('http')) {
    Icon = icons[iconKey] ?? icons.unknown;
  } else {
    Icon = iconURL
      ? () => (
        <div
          className="icon-xl mr-1 shrink-0 overflow-hidden rounded-full "
          style={{ width: '20', height: '20' }}
        >
          <img
            src={iconURL}
            alt={currentSpec.name}
            style={{ width: '100%', height: '100%' }}
            className="object-cover"
          />
        </div>
      )
      : icons[endpoint ?? ''] ?? icons.unknown;
  }

  return (
    <Icon
      size={20}
      endpoint={endpoint}
      context="menu-item"
      iconURL={endpointIconURL}
      className="icon-lg mr-1 shrink-0 dark:text-white"
    />
  );
};

export default SpecIcon;
