import React from 'react';
export default function AdjustButton({ onClick }) {
  const clickHandler = e => {
    e.preventDefault();
    onClick();
  };
  return (
    <button
      onClick={clickHandler}
      className="group absolute bottom-11 -right-11 flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500 md:bottom-0"
    >
      <div className="m-1 mr-0 rounded-md p-2 pt-[10px] pb-[10px] group-hover:bg-gray-100 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-900 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          height="1em"
          width="1em"
          strokeWidth="2"
          stroke="currentColor"
          className="mr-1 h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          />
        </svg>
      </div>
    </button>
  );
}
