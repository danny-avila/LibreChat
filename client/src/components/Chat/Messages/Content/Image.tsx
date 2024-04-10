import React, { useState, useRef, useMemo } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import * as Dialog from '@radix-ui/react-dialog';
import DialogImage from './DialogImage';
import { cn } from '~/utils';

const scaleImage = ({
  originalWidth,
  originalHeight,
  containerRef,
}: {
  originalWidth: number;
  originalHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const containerWidth = containerRef.current?.offsetWidth ?? 0;
  if (containerWidth === 0 || originalWidth === undefined || originalHeight === undefined) {
    return { width: 'auto', height: 'auto' };
  }
  const aspectRatio = originalWidth / originalHeight;
  const scaledWidth = Math.min(containerWidth, originalWidth);
  const scaledHeight = scaledWidth / aspectRatio;
  return { width: `${scaledWidth}px`, height: `${scaledHeight}px` };
};

const Image = ({
  imagePath,
  altText,
  height,
  width,
  placeholderDimensions,
}: {
  imagePath: string;
  altText: string;
  height: number;
  width: number;
  placeholderDimensions?: {
    height: string;
    width: string;
  };
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageLoad = () => setIsLoaded(true);

  const { width: scaledWidth, height: scaledHeight } = useMemo(
    () =>
      scaleImage({
        originalWidth: Number(placeholderDimensions?.width?.split('px')[0]) ?? width,
        originalHeight: Number(placeholderDimensions?.height?.split('px')[0]) ?? height,
        containerRef,
      }),
    [placeholderDimensions, height, width],
  );

  return (
    <Dialog.Root>
      <div ref={containerRef}>
        <div className="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Dialog.Trigger asChild>
            <button type="button" aria-haspopup="dialog" aria-expanded="false">
              <LazyLoadImage
                alt={altText}
                onLoad={handleImageLoad}
                visibleByDefault={true}
                className={cn(
                  'opacity-100 transition-opacity duration-100',
                  isLoaded ? 'opacity-100' : 'opacity-0',
                )}
                src={imagePath}
                style={{
                  width: scaledWidth,
                  height: 'auto',
                  color: 'transparent',
                }}
                placeholder={<div style={{ width: scaledWidth, height: scaledHeight }} />}
              />
            </button>
          </Dialog.Trigger>
        </div>
      </div>
      {isLoaded && <DialogImage src={imagePath} height={height} width={width} />}
    </Dialog.Root>
  );
};

export default Image;
