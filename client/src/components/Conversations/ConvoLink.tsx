import React, { useEffect, useRef, useState } from 'react';
import type { TOptions } from 'i18next';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { cn } from '~/utils';

interface ConvoLinkProps {
  isActiveConvo: boolean;
  isPopoverActive: boolean;
  isHovered: boolean;
  isSharedBadgeVisible: boolean;
  title: string | null;
  onRename: () => void;
  isSmallScreen: boolean;
  localize: (key: TranslationKeys, options?: TOptions) => string;
  children: React.ReactNode;
}

const ConvoLink: React.FC<ConvoLinkProps> = ({
  isActiveConvo,
  isPopoverActive,
  isHovered,
  isSharedBadgeVisible,
  title,
  onRename,
  isSmallScreen,
  localize,
  children,
}) => {
  const [isOverflowing, setIsOverflowing] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const displayTitle = title || localize('com_ui_untitled');

  useEffect(() => {
    const viewport = titleRef.current;
    const text = textRef.current;
    if (!viewport || !text) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | undefined;
    let fadeAnimation: Animation | undefined;

    const start = () => {
      animation?.cancel();
      fadeAnimation?.cancel();
      const overflow = text.getBoundingClientRect().width - viewport.getBoundingClientRect().width;
      setIsOverflowing(overflow > 0);
      if (!isHovered || isSmallScreen || reducedMotion.matches || overflow <= 0) {
        return;
      }

      const style = getComputedStyle(viewport);
      const direction = style.direction === 'rtl' ? 1 : -1;
      const fadeWidth = parseFloat(style.getPropertyValue('--convo-title-fade-width'));
      const travelDuration = (overflow / 30) * 1000;
      const duration = travelDuration + 2000;
      const end = `translateX(${direction * overflow}px)`;
      const timing = { duration, delay: 600, iterations: Infinity, easing: 'linear' };

      animation = text.animate(
        [
          { transform: 'translateX(0)' },
          { transform: end, offset: travelDuration / duration },
          { transform: end },
        ],
        timing,
      );

      /** Reveal the final characters by moving the fade, not by overscrolling the text. */
      const fullMask = `calc(100% + ${fadeWidth}px) 100%`;
      fadeAnimation = viewport.animate(
        [
          { maskSize: '100% 100%' },
          {
            maskSize: '100% 100%',
            offset: (Math.max(0, (overflow - fadeWidth) / 30) * 1000) / duration,
          },
          { maskSize: fullMask, offset: travelDuration / duration },
          { maskSize: fullMask },
        ],
        timing,
      );
    };

    const observer = new ResizeObserver(start);
    observer.observe(viewport);
    observer.observe(text);
    if (isHovered) {
      reducedMotion.addEventListener('change', start);
    }
    start();

    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', start);
      animation?.cancel();
      fadeAnimation?.cancel();
    };
  }, [isHovered, isSmallScreen, displayTitle]);

  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 grow cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary',
        isActiveConvo || isPopoverActive ? 'bg-surface-active-alt' : '',
      )}
      aria-current={isActiveConvo ? 'page' : undefined}
      aria-label={
        isSharedBadgeVisible
          ? localize('com_ui_conversation_label_shared', {
              title: title || localize('com_ui_untitled'),
            })
          : localize('com_ui_conversation_label', {
              title: title || localize('com_ui_untitled'),
            })
      }
    >
      {children}
      <span
        ref={titleRef}
        className={cn(
          'min-w-0 flex-1 overflow-hidden whitespace-nowrap [--convo-title-fade-width:24px] [mask-position:left] [mask-repeat:no-repeat] [text-align:start] [&:dir(rtl)]:[mask-position:right]',
          isOverflowing &&
            '[mask-image:linear-gradient(to_right,currentColor_calc(100%_-_var(--convo-title-fade-width)),transparent)] [&:dir(rtl)]:[mask-image:linear-gradient(to_left,currentColor_calc(100%_-_var(--convo-title-fade-width)),transparent)]',
        )}
        onDoubleClick={(e) => {
          if (isSmallScreen) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onRename();
        }}
      >
        <span ref={textRef} className="inline-block">
          {displayTitle}
        </span>
      </span>
    </button>
  );
};

export default ConvoLink;
