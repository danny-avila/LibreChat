import React, { memo, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { icons } from '~/hooks/Endpoint/Icons';

/**
 * Dynamically load an SVG icon from a URL
 * This is needed in order to support the currentColor attribute in the SVG icon.
 * @param url - The URL of the SVG icon
 * @returns Div with the SVG icon
 */
const DynamicSVGIcon = ({ url }: { url: string }) => {
  const [svgContent, setSvgContent] = useState<string | null>(null);

  useEffect(() => {
    fetch(url)
      .then((res) => res.text())
      .then((svg) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        if (doc.documentElement.nodeName !== 'svg') {
          console.error('Content is not an SVG element:', doc.documentElement.nodeName);
          return;
        }
        const svgElement = doc.querySelector('svg');
        if (svgElement) {
          svgElement.setAttribute('width', '100%');
          svgElement.setAttribute('height', '100%');
          setSvgContent(svgElement.outerHTML);
        } else {
          setSvgContent(svg);
        }
      });
  }, [url]);

  if (!svgContent) {
    return null;
  }

  return (
    <div
      style={{ width: '100%', height: '100%'}}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};

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

    const handleImageError = () => {
      setImageError(true);
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
              <AlertCircle size={10} className="text-white" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={className} style={containerStyle}>
        {iconURL.endsWith('.svg') ? (
          <DynamicSVGIcon url={iconURL} />
        ) : (
          <img
            src={iconURL}
            alt={altName ?? 'Icon'}
            style={imageStyle}
            className="object-cover"
            onError={handleImageError}
            loading="lazy"
            decoding="async"
            width={Number(containerStyle.width) || 20}
            height={Number(containerStyle.height) || 20}
          />
        )}
      </div>
    );
  },
);

URLIcon.displayName = 'URLIcon';
