import React, { memo, useState } from 'react';
import { AlertCircle, Feather } from 'lucide-react';
import { ProviderIcon, Sparkles } from '@librechat/client';
import { EModelEndpoint, resolveProviderId } from 'librechat-data-provider';
import { isImageURL } from '~/utils/icons';

interface GroupIconProps {
  iconURL: string;
  groupName: string;
}

const GroupIcon: React.FC<GroupIconProps> = ({ iconURL, groupName }) => {
  const [imageError, setImageError] = useState(false);
  const provider = resolveProviderId(iconURL);

  const handleImageError = () => {
    setImageError(true);
  };

  if (iconURL === EModelEndpoint.agents) {
    return (
      <div className="relative" style={{ width: 20, height: 20, margin: '2px' }} title={groupName}>
        <Feather className="icon-md shrink-0" aria-hidden="true" />
      </div>
    );
  }

  if (iconURL === EModelEndpoint.assistants || iconURL === EModelEndpoint.azureAssistants) {
    return (
      <div className="relative" style={{ width: 20, height: 20, margin: '2px' }} title={groupName}>
        <Sparkles className="icon-md shrink-0" aria-hidden="true" />
      </div>
    );
  }

  if (provider || !isImageURL(iconURL) || imageError) {
    return (
      <div className="relative" style={{ width: 20, height: 20, margin: '2px' }}>
        <ProviderIcon provider={provider} size={20} className="icon-md shrink-0" />
        {imageError && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-surface-destructive"
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
