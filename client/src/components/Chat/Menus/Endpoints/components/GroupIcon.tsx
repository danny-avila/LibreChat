import React, { memo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { IconMapProps } from '~/common';
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
      <div className="relative" style={{ width: 20, height: 20, margin: '2px' }}>
        <div className="icon-md shrink-0 overflow-hidden rounded-full">
          <DefaultIcon context="menu-item" size={20} />
        </div>
        {imageError && iconURL && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-red-500"
            style={{ width: '14px', height: '14px', top: 0, right: 0 }}
          >
            <AlertCircle size={10} className="text-white" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="icon-md shrink-0 overflow-hidden rounded-full"
      style={{ width: 20, height: 20 }}
    >
      <img
        src={iconURL}
        alt={groupName}
        className="h-full w-full object-cover"
        onError={handleImageError}
      />
    </div>
  );
};

export default memo(GroupIcon);
