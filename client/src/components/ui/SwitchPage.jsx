import React from 'react';

export default function SwitchPage({ switchHandler, direction }) {
  return (
    <button
      onClick={switchHandler}
      className={ direction === 'left' ?
        'h-96 left-20 absolute bottom-[124px] z-10 cursor-pointer rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 md:bottom-[200px]'
        : 'h-96 right-20 absolute bottom-[124px] z-10 cursor-pointer rounded-full border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/10 dark:text-gray-200 md:bottom-[200px]'
      }
    >
      <svg
        stroke="currentColor"
        fill="none"
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="m-1 h-4 w-8"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        {direction === 'left' ? <>
          <line x1="1" y1="12" x2="19" y2="12" />
          <polyline points="8 19 1 12 8 5" />
        </>
          : <>
            <line x1="1" y1="12" x2="19" y2="12" />
            <polyline points="12 19 19 12 12 5" />
          </>}

      </svg>
    </button>
  );
}
