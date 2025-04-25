import React, { useState, useRef, useMemo } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import * as Dialog from '@radix-ui/react-dialog';
import DialogImage from './DialogImage';
import { Skeleton } from '~/components';
import { cn } from '~/utils';

const scaleImage = ({
  originalWidth,
  originalHeight,
  containerRef,
}: {
  originalWidth?: number;
  originalHeight?: number;
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const containerWidth = containerRef.current?.offsetWidth ?? 0;
  if (containerWidth === 0 || originalWidth == null || originalHeight == null) {
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
  className,
}: {
  imagePath: string;
  altText: string;
  height: number;
  width: number;
  placeholderDimensions?: {
    height?: string;
    width?: string;
  };
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageLoad = () => setIsLoaded(true);

  const { width: scaledWidth, height: scaledHeight } = useMemo(
    () =>
      scaleImage({
        originalWidth: Number(placeholderDimensions?.width?.split('px')[0] ?? width),
        originalHeight: Number(placeholderDimensions?.height?.split('px')[0] ?? height),
        containerRef,
      }),
    [placeholderDimensions, height, width],
  );

  // Use Radix Dialog Trigger for better accessibility integration
  // It handles keyboard interactions (Enter/Space) and associates ARIA attributes correctly.
  return (
    <>
      <div ref={containerRef}>
        <div
          className={cn(
            'relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden rounded-lg bg-surface-active-alt text-text-secondary-alt',
            className,
          )}
        >
          {/* Wrap LazyLoadImage with Dialog.Trigger */}
          <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label={`View ${altText} in dialog`} // Provide a clear label for screen readers
                className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" // Add focus styles
              >
                <LazyLoadImage
                  alt={altText} // Alt text is crucial for accessibility
                  onLoad={handleImageLoad}
                  visibleByDefault={true}
                  className={cn(
                    'opacity-100 transition-opacity duration-100',
                    isLoaded ? 'opacity-100' : 'opacity-0',
                  )}
                  src={imagePath}
                  style={{
                    width: scaledWidth,
                    height: 'auto', // Maintain aspect ratio
                    color: 'transparent',
                    display: 'block', // Ensure image behaves like a block element
                  }}
                  // Show skeleton while loading
                  placeholder={
                    <Skeleton
                      className={cn(
                        'h-auto w-full', // Use scaled dimensions for skeleton
                        `h-[${scaledHeight}] w-[${scaledWidth}]`,
                      )}
                      // Add ARIA attributes for loading state if needed, though skeleton might suffice
                      // aria-label="Loading image"
                      // aria-busy="true"
                    />
                  }
                />
              </button>
            </Dialog.Trigger>
            {/* Dialog Content - Radix handles focus trapping and Escape key */}
            {isLoaded && <DialogImage isOpen={isOpen} onOpenChange={setIsOpen} src={imagePath} />}
          </Dialog.Root>
        </div>
      </div>
    </>
  );
};

export default Image;
