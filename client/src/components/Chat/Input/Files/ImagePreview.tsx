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

interface CloseModalEvent {
  stopPropagation: () => void;
  preventDefault: () => void;
}

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

  const closeModal = useCallback(
    (e: CloseModalEvent): void => {
      setIsModalOpen(false);
      e.stopPropagation();
      e.preventDefault();

      if (
        previousActiveElement instanceof HTMLElement &&
        !previousActiveElement.closest('[data-skip-refocus="true"]')
      ) {
        previousActiveElement.focus();
      }
    },
    [previousActiveElement],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal(e);
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
          className="size-full overflow-hidden rounded-lg"
          style={style}
          aria-label={`View ${alt} in full size`}
          aria-haspopup="dialog"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
          }}
        />
        {progress < 1 ? (
          <ProgressCircle
            circumference={circumference}
            offset={offset}
            circleCSSProperties={circleCSSProperties}
            aria-label={`Loading progress: ${Math.round(progress * 100)}%`}
          />
        ) : (
          <div
            className={cn(
              'absolute inset-0 flex cursor-pointer items-center justify-center rounded-lg transition-opacity duration-200 ease-in-out',
              isHovered ? 'bg-black/20 opacity-100' : 'opacity-0',
            )}
            onClick={(e) => {
              e.stopPropagation();
              openModal();
            }}
            aria-hidden="true"
          >
            <Maximize2
              className={cn(
                'size-5 transform-gpu text-white drop-shadow-lg transition-all duration-200',
                isHovered ? 'scale-110' : '',
              )}
            />
          </div>
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
              className="absolute right-4 top-4 z-[1000] rounded-full p-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={(e) => {
                e.stopPropagation();
                closeModal(e);
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
              className="max-h-[90vh] max-w-[90vw] transform transition-transform duration-50 ease-in-out animate-in zoom-in-90"
              role="presentation"
            >
              <img
                src={imageUrl}
                alt={alt}
                className="max-w-screen max-h-screen object-contain"
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
