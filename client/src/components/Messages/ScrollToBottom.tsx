import React from 'react';

type Props = {
  scrollHandler: React.MouseEventHandler<HTMLButtonElement>;
};

export default function ScrollToBottom({ scrollHandler }: Props) {
  return (
    <button
      onClick={scrollHandler}
      className="cursor-pointer absolute z-10 rounded-full bg-clip-padding border text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 right-1/2 border-black/10 bg-token-surface-primary bottom-5"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="m-1 text-black dark:text-white">
        <path d="M17 13L12 18L7 13M12 6L12 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
      </svg>
    </button>
  );
}