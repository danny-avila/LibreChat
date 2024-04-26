import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import type { IconMapProps } from '~/common';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';

interface IconComponentProps {
  currentSpec: TModelSpec;
}

const IconComponent: React.FC<IconComponentProps> = ({ currentSpec }) => {
  const iconURL = currentSpec.iconURL ?? '';
  let Icon: (props: IconMapProps) => React.JSX.Element;

  if (!iconURL?.includes('http')) {
    Icon = icons[iconURL] ?? icons.unknown;
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
      : icons[currentSpec.preset.endpoint ?? ''] ?? icons.unknown;
  }

  return <Icon size={20} className="icon-lg mr-1 shrink-0 dark:text-white" />;
};

export default IconComponent;
