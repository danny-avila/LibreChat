import React, { memo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { icons } from '~/hooks/Endpoint/Icons';

export const URLIcon = memo(
  ({
    iconURL,
    altName,
    containerStyle = { width: '20', height: '20' },
    imageStyle = { width: '100%', height: '100%' },
    className = 'icon-xl mr-1 shrink-0 overflow-hidden rounded-full',
    endpoint,
  }: {
    iconURL: string;
    altName?: string | null;
    className?: string;
    containerStyle?: React.CSSProperties;
    imageStyle?: React.CSSProperties;
    endpoint?: string;
  }) => {
    const [imageError, setImageError] = useState(false);

    const handleImageError = () => {
      setImageError(true);
    };

    const DefaultIcon: React.ElementType =
      endpoint && icons[endpoint] ? icons[endpoint]! : icons.unknown!;
    if (imageError || !iconURL) {
      return (
        <div className="relative" style={{ ...containerStyle, margin: '2px' }}>
          <div className={className}>
            <DefaultIcon endpoint={endpoint} context="menu-item" />
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
      <div className={className} style={containerStyle}>
        <img
          src={iconURL}
          alt={altName ?? ''}
          style={imageStyle}
          className="object-cover"
          onError={handleImageError}
        />
      </div>
    );
  },
);

URLIcon.displayName = 'URLIcon';
