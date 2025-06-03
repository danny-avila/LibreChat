import { useState, useEffect, useCallback } from 'react';
import { Maximize2 } from 'lucide-react';
import { OGDialog, OGDialogContent } from '~/components/ui';
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
        className={cn('relative size-14 rounded-xl', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          className="size-full overflow-hidden rounded-xl"
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
              'absolute inset-0 flex transform-gpu cursor-pointer items-center justify-center rounded-xl transition-opacity duration-200 ease-in-out',
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

      <OGDialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <OGDialogContent
          showCloseButton={false}
          className="w-11/12 overflow-x-auto bg-transparent p-0 sm:w-auto"
          disableScroll={false}
        >
          <img
            src={imageUrl}
            alt={alt}
            className="max-w-screen h-full max-h-screen w-full object-contain"
          />
        </OGDialogContent>
      </OGDialog>
    </>
  );
};

export default ImagePreview;
