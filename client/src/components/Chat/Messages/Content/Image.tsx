import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Skeleton } from '@librechat/client';
import { apiBaseUrl } from 'librechat-data-provider';
import { cn, toAbsoluteFilePath } from '~/utils';
import DialogImage from './DialogImage';
import { cn, isSafeImageSrc, toRenderableImageUrl } from '~/utils';

/** Max display height for chat images (Tailwind JIT class) */
export const IMAGE_MAX_H = 'max-h-[45vh]' as const;
/** Matches the `max-w-lg` Tailwind class on the wrapper button (32rem = 512px at 16px base) */
const IMAGE_MAX_W_PX = 512;

/** Caches image dimensions by src so remounts can reserve space */
const dimensionCache = new Map<string, { width: number; height: number }>();
/** Tracks URLs that have been fully painted — skip skeleton on remount */
const paintedUrls = new Set<string>();

function getSafeDownloadFilename(value?: string): string {
  const candidate = value?.trim() || 'image.png';
  return candidate.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
}

/** Test-only: resets module-level caches */
export function _resetImageCaches(): void {
  dimensionCache.clear();
  paintedUrls.clear();
}

function computeHeightStyle(w: number, h: number): React.CSSProperties {
  return { height: `min(45vh, ${(h / w) * 100}vw, ${(h / w) * IMAGE_MAX_W_PX}px)` };
}

const Image = ({
  imagePath,
  altText,
  className,
  args,
  width,
  height,
}: {
  imagePath: string;
  altText: string;
  className?: string;
  args?: {
    prompt?: string;
    quality?: 'low' | 'medium' | 'high';
    size?: string;
    style?: string;
    [key: string]: unknown;
  };
  width?: number;
  height?: number;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const absoluteImageUrl = useMemo(() => {
    if (!imagePath) return imagePath;

    if (
      imagePath.startsWith('http') ||
      imagePath.startsWith('data:') ||
      !imagePath.startsWith('/images/')
    ) {
      return imagePath;
    }

    const baseURL = apiBaseUrl();
    return `${baseURL}${imagePath}`;
  }, [imagePath]);
  const safeImageUrl = isSafeImageSrc(absoluteImageUrl) ? absoluteImageUrl : '';
  const safeRenderableImageUrl = safeImageUrl ? toRenderableImageUrl(safeImageUrl) : '';
  const safeDownloadFilename = getSafeDownloadFilename(altText);

  const downloadImage = async (): Promise<void> => {
    if (!safeRenderableImageUrl) {
      return;
    }
    try {
      const response = await fetch(safeRenderableImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = safeDownloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      const link = document.createElement('a');
      link.href = safeRenderableImageUrl;
      link.download = safeDownloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  useEffect(() => {
    if (width && height && safeImageUrl) {
      dimensionCache.set(safeImageUrl, { width, height });
    }
  }, [safeImageUrl, width, height]);

  if (!safeImageUrl || !safeRenderableImageUrl) {
    return null;
  }

  const dims = width && height ? { width, height } : dimensionCache.get(safeImageUrl);
  const hasDimensions = !!(dims?.width && dims?.height);
  const heightStyle = hasDimensions ? computeHeightStyle(dims.width, dims.height) : undefined;
  const showSkeleton = hasDimensions && !paintedUrls.has(safeImageUrl);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View ${altText} in dialog`}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className={cn(
          'relative mt-1 w-full max-w-lg cursor-pointer overflow-hidden rounded-lg border border-border-light text-text-secondary-alt shadow-md transition-shadow',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary',
          className,
        )}
        style={heightStyle}
      >
        {showSkeleton && <Skeleton className="absolute inset-0" aria-hidden="true" />}
        <img
          alt={altText}
          src={safeRenderableImageUrl}
          onLoad={() => paintedUrls.add(safeImageUrl)}
          className={cn(
            'relative block text-transparent',
            hasDimensions
              ? 'size-full object-contain'
              : cn('h-auto w-auto max-w-full', IMAGE_MAX_H),
          )}
        />
      </button>
      <DialogImage
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        src={safeImageUrl}
        downloadImage={downloadImage}
        args={args}
        triggerRef={triggerRef}
      />
    </div>
  );
};

export default Image;
