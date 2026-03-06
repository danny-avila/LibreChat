import React, { useState, useRef, useMemo } from 'react';
import { Skeleton } from '@librechat/client';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { apiBaseUrl } from 'librechat-data-provider';
import { cn } from '~/utils';
import DialogImage from './DialogImage';

/** Max display height for chat images (Tailwind JIT class) */
const IMAGE_MAX_H = 'max-h-[45vh]' as const;

const Image = ({
  imagePath,
  altText,
  className,
  args,
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleImageLoad = () => setIsLoaded(true);

  // Fix image path to include base path for subdirectory deployments
  const absoluteImageUrl = useMemo(() => {
    if (!imagePath) return imagePath;

    // If it's already an absolute URL or doesn't start with /images/, return as is
    if (
      imagePath.startsWith('http') ||
      imagePath.startsWith('data:') ||
      !imagePath.startsWith('/images/')
    ) {
      return imagePath;
    }

    // Get the base URL and prepend it to the image path
    const baseURL = apiBaseUrl();
    return `${baseURL}${imagePath}`;
  }, [imagePath]);

  const downloadImage = async () => {
    try {
      const response = await fetch(absoluteImageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = altText || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      const link = document.createElement('a');
      link.href = absoluteImageUrl;
      link.download = altText || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`View ${altText} in dialog`}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className={cn(
          'relative mt-1 flex h-auto w-full max-w-lg cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border-light text-text-secondary-alt shadow-md transition-shadow',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary',
          className,
        )}
      >
        <LazyLoadImage
          alt={altText}
          onLoad={handleImageLoad}
          visibleByDefault={true}
          className={cn(
            'block h-auto w-auto max-w-full text-transparent transition-opacity duration-100',
            IMAGE_MAX_H,
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
          src={absoluteImageUrl}
          placeholder={
            <Skeleton
              className={cn(IMAGE_MAX_H, 'h-48 w-full max-w-lg')}
              aria-label="Loading image"
              aria-busy="true"
            />
          }
        />
      </button>
      {isLoaded && (
        <DialogImage
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          src={absoluteImageUrl}
          downloadImage={downloadImage}
          args={args}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
};

export default Image;
