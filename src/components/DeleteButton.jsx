import React from 'react';

export default function DeleteButton({ onClick, disabled }) {
  return (
    <button className="p-1 hover:text-white">
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
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line
          x1="10"
          y1="11"
          x2="10"
          y2="17"
        />
        <line
          x1="14"
          y1="11"
          x2="14"
          y2="17"
        />
      </svg>
    </button>
  );
}
