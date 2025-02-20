import React, { memo } from 'react';

export const URLIcon = memo(
  ({
    iconURL,
    altName,
    containerStyle = { width: '20', height: '20' },
    imageStyle = { width: '100%', height: '100%' },
    className = 'icon-xl mr-1 shrink-0 overflow-hidden rounded-full',
  }: {
    iconURL: string;
    altName?: string | null;
    className?: string;
    containerStyle?: React.CSSProperties;
    imageStyle?: React.CSSProperties;
  }) => (
    <div className={className} style={containerStyle}>
      <img src={iconURL} alt={altName ?? ''} style={imageStyle} className="object-cover" />
    </div>
  ),
);
