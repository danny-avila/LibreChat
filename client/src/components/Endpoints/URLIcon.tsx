import React, { memo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { pxToRem } from '@librechat/client';
import { icons } from '~/hooks/Endpoint/Icons';

/** Intrinsic fallback for parents without a definite size; `h-full w-full` scales it elsewhere. */
const FALLBACK_ICON_PX = 20;

export const URLIcon = memo(
  ({
    iconURL,
    altName,
    containerStyle = { width: pxToRem(FALLBACK_ICON_PX), height: pxToRem(FALLBACK_ICON_PX) },
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

    const handleImageError = () => {
      setImageError(true);
    };

    const DefaultIcon: React.ElementType =
      endpoint && icons[endpoint] ? icons[endpoint]! : icons.unknown!;

    if (imageError || !iconURL) {
      return (
        <div className="relative" style={{ ...containerStyle, margin: pxToRem(2) }}>
          <div className={className}>
            <DefaultIcon
              endpoint={endpoint}
              context="menu-item"
              size={FALLBACK_ICON_PX}
              className="h-full w-full"
            />
          </div>
          {imageError && iconURL && (
            <div
              className="absolute flex items-center justify-center rounded-full bg-status-error"
              style={{ width: pxToRem(14), height: pxToRem(14), top: 0, right: 0 }}
            >
              <AlertCircle size={10} className="text-white" aria-hidden="true" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={className} style={containerStyle}>
        <img
          src={iconURL}
          alt={altName ?? 'Icon'}
          style={imageStyle}
          className="object-cover"
          onError={handleImageError}
          loading="lazy"
          decoding="async"
          width={FALLBACK_ICON_PX}
          height={FALLBACK_ICON_PX}
        />
      </div>
    );
  },
);

URLIcon.displayName = 'URLIcon';
