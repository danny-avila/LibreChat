import React, { memo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { pxToRem } from '@librechat/client';
import type { IconMapProps } from '~/common';
import { getKnownEndpointAsset, hasKnownEndpointIcon } from '~/hooks/Endpoint/UnknownIcon';
import { icons } from '~/hooks/Endpoint/Icons';

interface GroupIconProps {
  iconURL: string;
  groupName: string;
}

type IconType = (props: IconMapProps) => React.JSX.Element;

const GroupIcon: React.FC<GroupIconProps> = ({ iconURL, groupName }) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  // Check if the iconURL is a built-in icon key
  if (iconURL in icons) {
    const Icon: IconType = (icons[iconURL] ?? icons.unknown) as IconType;
    return <Icon size={20} context="menu-item" className="icon-md shrink-0 text-text-primary" />;
  }

  if (imageError) {
    const DefaultIcon: IconType = icons.unknown as IconType;
    return (
      <div
        className="relative"
        style={{ width: pxToRem(20), height: pxToRem(20), margin: pxToRem(2) }}
      >
        <div className="icon-md shrink-0 overflow-hidden rounded-full">
          <DefaultIcon context="menu-item" size={20} className="h-full w-full" />
        </div>
        {imageError && iconURL && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-surface-destructive"
            style={{ width: pxToRem(14), height: pxToRem(14), top: 0, right: 0 }}
          >
            <AlertCircle size={10} className="text-white" />
          </div>
        )}
      </div>
    );
  }

  const resolvedIconURL = getKnownEndpointAsset(iconURL);

  if (!resolvedIconURL && hasKnownEndpointIcon(iconURL)) {
    const Icon: IconType = icons.unknown as IconType;
    return (
      <Icon
        size={20}
        endpoint={iconURL}
        context="menu-item"
        className="icon-md shrink-0 text-text-primary"
      />
    );
  }

  return (
    <div
      className="icon-md shrink-0 overflow-hidden rounded-full"
      style={{ width: pxToRem(20), height: pxToRem(20) }}
    >
      <img
        src={resolvedIconURL || iconURL}
        alt={groupName}
        className="h-full w-full object-cover"
        onError={handleImageError}
      />
    </div>
  );
};

export default memo(GroupIcon);
