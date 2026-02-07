import React, { memo, useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Skeleton } from '@librechat/client';
import { icons } from '~/hooks/Endpoint/Icons';
import { isImageCached } from '~/utils';

export const URLIcon = memo(
  ({
    iconURL,
    altName,
    containerStyle = { width: 20, height: 20 },
    imageStyle = { width: '100%', height: '100%' },
    className = 'icon-md mr-1 shrink-0 overflow-hidden rounded-full',
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
    const [isLoaded, setIsLoaded] = useState(() => isImageCached(iconURL));

    useEffect(() => {
      if (isImageCached(iconURL)) {
        setIsLoaded(true);
        setImageError(false);
      } else {
        setIsLoaded(false);
        setImageError(false);
      }
    }, [iconURL]);

    const handleImageError = () => {
      setImageError(true);
      setIsLoaded(false);
    };

    const DefaultIcon: React.ElementType =
      endpoint && icons[endpoint] ? icons[endpoint]! : icons.unknown!;

    if (imageError || !iconURL) {
      return (
        <div className="relative" style={{ ...containerStyle, margin: '2px' }}>
          <div className={className}>
            <DefaultIcon endpoint={endpoint} context="menu-item" size={containerStyle.width} />
          </div>
          {imageError && iconURL && (
            <div
              className="absolute flex items-center justify-center rounded-full bg-red-500"
              style={{ width: '14px', height: '14px', top: 0, right: 0 }}
            >
              <AlertCircle size={10} className="text-white" aria-hidden="true" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={`${className} relative`} style={containerStyle}>
        <img
          src={iconURL}
          alt={altName ?? 'Icon'}
          style={{
            ...imageStyle,
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
          }}
          className="object-cover"
          onLoad={() => setIsLoaded(true)}
          onError={handleImageError}
          decoding="async"
          width={Number(containerStyle.width) || 20}
          height={Number(containerStyle.height) || 20}
        />
        {!isLoaded && !imageError && (
          <Skeleton
            className="absolute inset-0 rounded-full"
            style={{ width: containerStyle.width, height: containerStyle.height }}
            aria-hidden="true"
          />
        )}
      </div>
    );
  },
);

URLIcon.displayName = 'URLIcon';
