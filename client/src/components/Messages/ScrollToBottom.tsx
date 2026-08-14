import { forwardRef } from 'react';
import { useRecoilValue } from 'recoil';
import { ChevronDown } from 'lucide-react';
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
        className={cn(
          'pointer-events-none absolute left-0 right-0 mx-auto flex justify-end px-4 md:px-0',
          maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        )}
        style={{ bottom: `calc(1.25rem + ${overlayHeight}px)` }}
      >
        <button
          onClick={scrollHandler}
          className="premium-scroll-button pointer-events-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
          aria-label={localize('com_ui_scroll_to_bottom')}
        >
          <ChevronDown className="h-4 w-4 text-text-secondary" />
        </button>
      </div>
    );
  },
);

ScrollToBottom.displayName = 'ScrollToBottom';

export default ScrollToBottom;
