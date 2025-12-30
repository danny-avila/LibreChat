import { useState, useEffect, useCallback, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { FileSources } from 'librechat-data-provider';
import { OGDialog, OGDialogContent } from '@librechat/client';
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsModalOpen(open);
    if (!open && triggerRef.current) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
      });
    }
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

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
          ref={triggerRef}
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

      <OGDialog open={isModalOpen} onOpenChange={handleOpenChange}>
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
