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

type IconType = (props: IconMapProps) => React.JSX.Element;

const SpecIcon: React.FC<SpecIconProps> = ({ currentSpec, endpointsConfig }) => {
  const iconURL = getModelSpecIconURL(currentSpec);
  const { endpoint } = currentSpec.preset;
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointIconURL });
  let Icon: IconType;

  if (!iconURL.includes('http')) {
    Icon = (icons[iconKey] ?? icons.unknown) as IconType;
  } else if (iconURL) {
    return <URLIcon iconURL={iconURL} altName={currentSpec.name} />;
  } else {
    Icon = (icons[endpoint ?? ''] ?? icons.unknown) as IconType;
  }

  return (
    <Icon
      size={20}
      endpoint={endpoint}
      context="menu-item"
      iconURL={endpointIconURL}
      className="icon-md shrink-0 text-text-primary"
    />
  );
};

export default memo(SpecIcon);
