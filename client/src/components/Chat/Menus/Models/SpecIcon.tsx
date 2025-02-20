import React, { memo } from 'react';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import { getModelSpecIconURL, getIconKey, getEndpointField } from '~/utils';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';
import { URLIcon } from '~/components/Endpoints/URLIcon';

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

  if (!iconURL.includes('http')) {
    Icon = icons[iconKey] ?? icons.unknown;
  } else if (iconURL) {
    return <URLIcon iconURL={iconURL} altName={currentSpec.name} />;
  } else {
    Icon = icons[endpoint ?? ''] ?? icons.unknown;
  }

  return (
    <Icon
      size={20}
      endpoint={endpoint}
      context="menu-item"
      iconURL={endpointIconURL}
      className="icon-lg mr-1 shrink-0 text-text-primary"
    />
  );
};

export default memo(SpecIcon);
