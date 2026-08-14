import { forwardRef } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type Props = {
  scrollHandler: React.MouseEventHandler<HTMLButtonElement>;
  /**
   * Height of the in-flight steer overlay, which stacks upward from the
   * composer into this same corner. Lifts the button clear of it.
   */
  overlayHeight?: number;
};

const ScrollToBottom = forwardRef<HTMLDivElement, Props>(
  ({ scrollHandler, overlayHeight = 0 }, ref) => {
    const localize = useLocalize();
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

    return (
      <div
        ref={ref}
        className="scrollbar-gutter-stable pointer-events-none absolute inset-x-0 z-10 overflow-y-auto"
        style={{ bottom: `calc(1.25rem + ${overlayHeight}px)` }}
      >
        <div
          className={cn(
            'mx-auto flex justify-end px-4 sm:px-2',
            maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={scrollHandler}
            aria-label={localize('com_ui_scroll_to_bottom')}
            className="pointer-events-auto rounded-full bg-surface-chat/90 text-text-primary active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  },
);

ScrollToBottom.displayName = 'ScrollToBottom';

export default ScrollToBottom;
