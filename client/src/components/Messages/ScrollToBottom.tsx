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
  /**
   * True once the enter transition has settled. The wrapper spans the column
   * and stays inert so it never swallows clicks meant for the thread, which
   * leaves the button to opt back in; gate that opt-in, because a descendant
   * that opts in is hit-testable even while its parent fades, so a fading or
   * not-yet-visible button would still take the click. Pointers are only half
   * of it: until this is true the control is also disabled, since an enabled
   * button stays in the tab order and answers Enter however it paints.
   */
  interactive?: boolean;
};

const ScrollToBottom = forwardRef<HTMLDivElement, Props>(
  ({ scrollHandler, overlayHeight = 0, interactive = false }, ref) => {
    const localize = useLocalize();
    const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);

    return (
      <div
        ref={ref}
        className="scrollbar-gutter-spacer pointer-events-none absolute inset-x-0 z-10"
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
            disabled={!interactive}
            aria-label={localize('com_ui_scroll_to_bottom')}
            className={cn(
              'rounded-full bg-surface-chat/90 text-text-primary active:scale-[0.96] motion-reduce:active:scale-100',
              /* The wrapper owns the fade, so being briefly unreachable must not
                 dim the control on its way in on top of it. */
              'disabled:opacity-100',
              interactive ? 'pointer-events-auto' : 'pointer-events-none',
            )}
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
