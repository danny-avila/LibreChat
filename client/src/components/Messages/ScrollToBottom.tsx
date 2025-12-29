import { forwardRef } from 'react';

type Props = {
  scrollHandler: React.MouseEventHandler<HTMLButtonElement>;
};

const ScrollToBottom = forwardRef<HTMLButtonElement, Props>(({ scrollHandler }, ref) => {
  return (
    <button
      ref={ref}
      onClick={scrollHandler}
      className="premium-scroll-button absolute bottom-5 right-1/2 cursor-pointer border border-border-light bg-surface-secondary"
      aria-label="Scroll to bottom"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-text-secondary">
        <path
          d="M17 13L12 18L7 13M12 6L12 17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        ></path>
      </svg>
    </button>
  );
});

ScrollToBottom.displayName = 'ScrollToBottom';

export default ScrollToBottom;
