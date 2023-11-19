import React, { useState } from 'react';

const Image = ({ imageUrl, altText, n, i }) => {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const handleImageLoad = (e: React.ChangeEvent<HTMLImageElement>) => {
    setImageSize({
      width: e.target.naturalWidth,
      height: e.target.naturalHeight,
    });
  };

  const imageStyle = () => {
    if (imageSize.height > 700 && n === 1) {
      return { maxHeight: '700px', width: 'auto', color: 'transparent' };
    }
    return { maxWidth: '100%', height: 'auto', color: 'transparent' };
  };

  return (
    <div className="">
      <div className="relative mt-1 flex h-auto w-full max-w-lg items-center justify-center overflow-hidden bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        <button type="button" aria-haspopup="dialog" aria-expanded="false">
          <img
            alt={altText}
            loading="lazy"
            decoding="async"
            className="max-w-full opacity-100 transition-opacity duration-300"
            src={imageUrl}
            onLoad={handleImageLoad}
            style={imageStyle()}
          />
        </button>
      </div>
    </div>
  );
};

export default Image;
