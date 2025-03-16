import React, { memo } from 'react';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import { getModelSpecIconURL, getIconKey, getEndpointField } from '~/utils';
import { URLIcon } from '~/components/Endpoints/URLIcon';
import { icons } from '~/hooks/Endpoint/Icons';

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
    Icon = (icons[iconKey] ?? icons.unknown) as (props: IconMapProps) => React.JSX.Element;
  } else if (iconURL) {
    return <URLIcon iconURL={iconURL} altName={currentSpec.name} />;
  } else {
    Icon = (icons[endpoint ?? ''] ?? icons.unknown) as (props: IconMapProps) => React.JSX.Element;
  }

  return <Icon endpoint={endpoint} context="menu-item" iconURL={endpointIconURL} />;
};

export default memo(SpecIcon);
