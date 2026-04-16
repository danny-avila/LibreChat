import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { XIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { Button, cn } from '@librechat/client';
import { useBannersQuery } from '~/data-provider';
import { useBannerRotation } from '~/hooks/Banners';
import { useLocalize } from '~/hooks';
import store from '~/store';

export interface BannerCarouselProps {
  onHeightChange?: (height: number) => void;
  intervalMs?: number;
  autoRotate?: boolean;
}

/**
 * Multi-banner carousel component with automatic rotation
 */
export const BannerCarousel = ({
  onHeightChange,
  intervalMs = 8000,
  autoRotate = true,
}: BannerCarouselProps) => {
  const { data: banners = [] } = useBannersQuery();
  const [hideBannerHint, setHideBannerHint] = useRecoilState<string[]>(store.hideBannerHint);
  const bannerRef = useRef<HTMLDivElement>(null);
  const localize = useLocalize();

  // Filter out dismissed banners
  const visibleBanners = banners.filter(
    (banner) => !banner.bannerId || banner.persistable || !hideBannerHint.includes(banner.bannerId),
  );

  const { currentBanner, currentIndex, nextBanner, previousBanner, goToBanner, pause, resume } =
    useBannerRotation({
      banners: visibleBanners,
      intervalMs,
      autoRotate,
    });

  const sanitizedMessage = useMemo(
    () => (currentBanner ? DOMPurify.sanitize(currentBanner.message) : ''),
    [currentBanner],
  );

  useEffect(() => {
    if (onHeightChange && bannerRef.current) {
      onHeightChange(bannerRef.current.offsetHeight);
    }
  }, [currentBanner, onHeightChange]);

  if (!currentBanner || visibleBanners.length === 0) {
    return null;
  }

  const handleDismiss = () => {
    if (currentBanner.persistable) {
      return;
    }

    setHideBannerHint([...hideBannerHint, currentBanner.bannerId]);

    if (onHeightChange) {
      onHeightChange(0);
    }
  };

  const showNavigation = visibleBanners.length > 1;

  return (
    <div
      ref={bannerRef}
      className="sticky top-0 z-20 flex items-center bg-presentation px-2 py-1 text-text-primary dark:bg-gradient-to-r md:relative"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* Previous button */}
      {showNavigation && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={localize('com_ui_banner_previous')}
          className="size-8 shrink-0"
          onClick={previousBanner}
        >
          <ChevronLeft className="h-4 w-4 text-text-primary" aria-hidden="true" />
        </Button>
      )}

      {/* Banner content */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
        <div
          className={cn(
            'text-md w-full truncate text-center [&_a]:text-blue-700 [&_a]:underline dark:[&_a]:text-blue-400',
            !currentBanner.persistable && 'px-4',
          )}
          dangerouslySetInnerHTML={{ __html: sanitizedMessage }}
        ></div>

        {/* Pagination dots */}
        {showNavigation && (
          <div className="flex gap-1.5">
            {visibleBanners.map((_, index) => (
              <button
                key={index}
                onClick={() => goToBanner(index)}
                className={cn(
                  'h-2 w-2 rounded-full transition-all',
                  index === currentIndex
                    ? 'w-4 bg-gray-700 dark:bg-gray-200'
                    : 'bg-gray-400 hover:bg-gray-600 dark:bg-gray-500 dark:hover:bg-gray-300',
                )}
                aria-label={localize('com_ui_banner_go_to', { number: index + 1 })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      {!currentBanner.persistable && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={localize('com_ui_banner_dismiss')}
          className="size-8 shrink-0"
          onClick={handleDismiss}
        >
          <XIcon className="h-4 w-4 text-text-primary" aria-hidden="true" />
        </Button>
      )}

      {/* Next button */}
      {showNavigation && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={localize('com_ui_banner_next')}
          className="size-8 shrink-0"
          onClick={nextBanner}
        >
          <ChevronRight className="h-4 w-4 text-text-primary" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
};
