import type { ReactEventHandler } from 'react';
import useAdaptiveIcon from '~/hooks/useAdaptiveIcon';
import { cn } from '~/utils';

interface CustomIconProps {
  src: string;
  alt?: string;
  className?: string;
  monochrome?: boolean;
  onError?: ReactEventHandler<HTMLImageElement>;
}

/**
 * Renders a user-provided custom icon (e.g. an MCP server `iconPath` or a model
 * group `groupIcon`). Monochrome SVG glyphs are masked with `currentColor` so
 * they follow the active theme, while raster images and multi-color SVG logos
 * keep their original colors. Pass an explicit `monochrome` flag to skip
 * detection when the icon's config already declares it. The tint color is
 * inherited from the element's text color, so set a `text-*` class on `className`.
 *
 * In forced-colors mode (Windows High Contrast) the UA overrides
 * `background-color`, which would blank a masked glyph, so `custom-icon-tint`
 * repaints it with the `CanvasText` system color (see `style.css`).
 */
export default function CustomIcon({
  src,
  alt = '',
  className,
  monochrome,
  onError,
}: CustomIconProps) {
  const { shouldTint } = useAdaptiveIcon(src, monochrome);
  const decorative = alt === '';

  if (shouldTint) {
    const maskUrl = `url("${src.replace(/"/g, '%22')}")`;
    return (
      <span
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative ? true : undefined}
        className={cn('custom-icon-tint inline-block', className)}
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
      >
        {onError != null && (
          <img src={src} alt="" aria-hidden="true" className="hidden" onError={onError} />
        )}
      </span>
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
