import { useState, useEffect, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';
import { FileSources } from 'librechat-data-provider';
import ProgressCircle from './ProgressCircle';
import SourceIcon from './SourceIcon';
import { cn } from '~/utils';

type styleProps = {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
};

const ImagePreview = ({
  imageBase64,
  url,
  progress = 1,
  className = '',
  source,
  alt = 'Preview image',
}: {
  imageBase64?: string;
  url?: string;
  progress?: number;
  className?: string;
  source?: FileSources;
  alt?: string;
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [previousActiveElement, setPreviousActiveElement] = useState<Element | null>(null);

  const openModal = useCallback(() => {
    setPreviousActiveElement(document.activeElement);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    if (previousActiveElement instanceof HTMLElement) {
      previousActiveElement.focus();
    }
  }, [previousActiveElement]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    },
    [closeModal],
  );

  useEffect(() => {
    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      const closeButton = document.querySelector('[aria-label="Close full view"]') as HTMLElement;
      if (closeButton) {
        setTimeout(() => closeButton.focus(), 0);
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, handleKeyDown]);

  const baseStyle: styleProps = {
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const imageUrl = imageBase64 ?? url ?? '';

  const style: styleProps = imageUrl
    ? {
        ...baseStyle,
        backgroundImage: `url(${imageUrl})`,
      }
    : baseStyle;

  if (typeof style.backgroundImage !== 'string' || style.backgroundImage.length === 0) {
    return null;
  }

  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - progress * circumference;
  const circleCSSProperties = {
    transition: 'stroke-dashoffset 0.3s linear',
  };

  return (
    <>
      <div
        className={cn('relative size-14 rounded-lg', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openModal();
          }}
          className="h-full w-full"
          style={style}
          aria-label={`Open ${alt} in full view`}
          aria-haspopup="dialog"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            openModal();
          }}
          className={cn(
            'absolute inset-0 flex transform-gpu items-center justify-center bg-black/20 transition-all duration-200 hover:scale-125',
            isHovered ? 'opacity-100' : 'opacity-0',
          )}
          aria-label={`Expand ${alt}`}
          aria-hidden={!isHovered}
          tabIndex={isHovered ? 0 : -1}
        >
          <Maximize2 className="size-5 text-white drop-shadow-lg" aria-hidden="true" />
        </button>
        {progress < 1 && (
          <ProgressCircle
            circumference={circumference}
            offset={offset}
            circleCSSProperties={circleCSSProperties}
            aria-label={`Loading progress: ${Math.round(progress * 100)}%`}
          />
        )}
        <SourceIcon source={source} aria-label={source ? `Source: ${source}` : undefined} />
      </div>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Full view of ${alt}`}
          className="fixed inset-0 z-[999] bg-black bg-opacity-80 transition-opacity duration-200 ease-in-out"
          onClick={closeModal}
        >
          <div className="flex h-full w-full cursor-default items-center justify-center">
            <button
              type="button"
              className="absolute right-4 top-4 z-[1000] rounded-full p-2 text-white focus:outline-none focus:ring-2 focus:ring-white"
              onClick={(e) => {
                e.stopPropagation();
                closeModal();
              }}
              aria-label="Close full view"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div
              className="max-h-[90vh] max-w-[90vw] transform transition-transform duration-200 ease-in-out"
              role="presentation"
            >
              <img
                src={imageUrl}
                alt={alt}
                className="max-h-full max-w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ImagePreview;
