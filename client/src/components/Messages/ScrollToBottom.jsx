import React from 'react';

export default function ScrollToBottom({ scrollHandler }) {
  return (
    <button
      onClick={scrollHandler}
      className="absolute bottom-[124px] right-6 z-[62] cursor-pointer rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 md:bottom-[120px]"
    >
      <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="m-1 h-4 w-4"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
    </button>
  );
}
