import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import DialogImage from './DialogImage';
import { cn } from '~/utils';

const Image = ({
  imageUrl,
  altText,
  n,
  i,
}: {
  imageUrl: string;
  altText: string;
  n: number;
  i: number;
}) => {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const handleImageLoad = (e: React.ChangeEvent<HTMLImageElement>) => {
    setImageSize({
      width: e.target.naturalWidth,
      height: e.target.naturalHeight,
    });
  };

  // const makeSquare = n >= 3 && i < 2;
  const imageStyle = () => {
    if (imageSize.height > 700 && n === 1) {
      return { maxHeight: '700px', width: 'auto', color: 'transparent' };
    }
    return { maxWidth: '100%', height: 'auto', color: 'transparent' };
  };

  return (
    <Dialog.Root>
      <div className="">
        <div className="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Dialog.Trigger>
            <button type="button" aria-haspopup="dialog" aria-expanded="false">
              <img
                alt={altText}
                loading="lazy"
                decoding="async"
                className={cn(
                  'max-w-full opacity-100 transition-opacity duration-300',
                  // n >= 3 && i < 2 ? 'aspect-square object-cover' : '',
                )}
                src={imageUrl}
                onLoad={handleImageLoad}
                style={imageStyle()}
              />
            </button>
          </Dialog.Trigger>
        </div>
      </div>
      <DialogImage src={imageUrl} />
    </Dialog.Root>
  );
};

export default Image;
