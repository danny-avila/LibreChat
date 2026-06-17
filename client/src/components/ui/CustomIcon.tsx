import type { ReactEventHandler } from 'react';
import useAdaptiveIcon from '~/hooks/useAdaptiveIcon';
import { cn } from '~/utils';

interface CustomIconProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: ReactEventHandler<HTMLImageElement>;
}

/**
 * Renders a user-provided custom icon (e.g. an MCP server `iconPath` or a model
 * group `groupIcon`). Monochrome SVG glyphs are masked with `currentColor` so
 * they follow the active theme, while raster images and multi-color SVG logos
 * keep their original colors. The tint color is inherited from the element's
 * text color, so set a `text-*` class on `className`.
 */
export default function CustomIcon({ src, alt = '', className, onError }: CustomIconProps) {
  const { shouldTint } = useAdaptiveIcon(src);
  const decorative = alt === '';

  if (shouldTint) {
    const maskUrl = `url("${src.replace(/"/g, '%22')}")`;
    return (
      <span
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative ? true : undefined}
        className={cn('inline-block', className)}
        style={{
          backgroundColor: 'currentColor',
          maskImage: maskUrl,
          WebkitMaskImage: maskUrl,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      aria-hidden={decorative ? true : undefined}
      className={className}
      onError={onError}
    />
  );
}
