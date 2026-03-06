import React, { useState, useRef, useMemo } from 'react';
import { apiBaseUrl } from 'librechat-data-provider';
import DialogImage from './DialogImage';
import { cn } from '~/utils';

/** Max display height for chat images (Tailwind JIT class) */
export const IMAGE_MAX_H = 'max-h-[45vh]' as const;

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

  // Fix image path to include base path for subdirectory deployments
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
        <img
          alt={altText}
          src={absoluteImageUrl}
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          className={cn('block h-auto w-auto max-w-full text-transparent', IMAGE_MAX_H)}
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
