import React from 'react';

export default function Embed({ children, language = ''}) {
  return (
    <pre>
      <div className="mb-4 rounded-md bg-black">
        <div className="relative flex items-center bg-gray-800 px-4 py-2 font-sans text-xs text-gray-200 rounded-tl-md rounded-tr-md">
          <span className="">{ language }</span>
          <button className="ml-auto flex gap-2">
            <svg
              stroke="currentColor"
              fill="none"
              strokeWidth="2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect
                x="8"
                y="2"
                width="8"
                height="4"
                rx="1"
                ry="1"
              ></rect>
            </svg>
            Copy code
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          { children }
        </div>
      </div>
    </pre>
  );
}
