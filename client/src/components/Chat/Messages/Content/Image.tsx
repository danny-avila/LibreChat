import React, { useState, memo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import DialogImage from './DialogImage';
import { cn } from '~/utils';

const Image = ({
  imagePath,
  altText,
  height,
  width,
  n,
  i,
}: {
  imagePath: string;
  altText: string;
  height: number;
  width: number;
  n: number;
  i: number;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const handleImageLoad = () => setIsLoaded(true);
  // const makeSquare = n >= 3 && i < 2;
  return (
    <Dialog.Root>
      <div className="">
        <div className="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Dialog.Trigger asChild>
            <button type="button" aria-haspopup="dialog" aria-expanded="false">
              <img
                // loading="lazy"
                alt={altText}
                className={cn(
                  'max-w-full opacity-100 transition-opacity duration-300',
                  // n >= 3 && i < 2 ? 'aspect-square object-cover' : '',
                  isLoaded ? 'opacity-100' : 'opacity-0',
                )}
                src={imagePath}
                onLoad={handleImageLoad}
                style={{
                  height: 'auto',
                  width,
                  color: 'transparent',
                }}
              />
            </button>
          </Dialog.Trigger>
        </div>
      </div>
      <DialogImage src={imagePath} height={height} width={width} />
    </Dialog.Root>
  );
};

export default memo(Image);
