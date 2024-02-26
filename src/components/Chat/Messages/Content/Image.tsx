import React, { useState, useEffect } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import * as Dialog from '@radix-ui/react-dialog';
import DialogImage from './DialogImage';
import { cn } from '~/utils';

const Image = ({
  imagePath,
  altText,
  height,
  width,
}: // n,
// i,
{
  imagePath: string;
  altText: string;
  height: number;
  width: number;
  // n: number;
  // i: number;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const handleImageLoad = () => setIsLoaded(true);
  const [minDisplayTimeElapsed, setMinDisplayTimeElapsed] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoaded) {
      timer = setTimeout(() => setMinDisplayTimeElapsed(true), 150);
    }
    return () => clearTimeout(timer);
  }, [isLoaded]);
  // const makeSquare = n >= 3 && i < 2;

  let placeholderHeight = '288px';
  if (height > width) {
    placeholderHeight = '900px';
  } else if (height === width) {
    placeholderHeight = width + 'px';
  }

  return (
    <Dialog.Root>
      <div className="">
        <div className="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Dialog.Trigger asChild>
            <button type="button" aria-haspopup="dialog" aria-expanded="false">
              <LazyLoadImage
                // loading="lazy"
                alt={altText}
                onLoad={handleImageLoad}
                className={cn(
                  'max-h-[900px] max-w-full opacity-100 transition-opacity duration-300',
                  // n >= 3 && i < 2 ? 'aspect-square object-cover' : '',
                  isLoaded && minDisplayTimeElapsed ? 'opacity-100' : 'opacity-0',
                )}
                src={imagePath}
                style={{
                  height: isLoaded && minDisplayTimeElapsed ? 'auto' : placeholderHeight,
                  width,
                  color: 'transparent',
                }}
                placeholder={
                  <div
                    style={{
                      height: isLoaded && minDisplayTimeElapsed ? 'auto' : placeholderHeight,
                      width,
                    }}
                  />
                }
              />
            </button>
          </Dialog.Trigger>
        </div>
      </div>
      <DialogImage src={imagePath} height={height} width={width} />
    </Dialog.Root>
  );
};

export default Image;
