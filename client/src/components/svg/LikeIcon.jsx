import React from 'react';

export default function LikeIcon({filled, style, onClick}) {
  return (
    <div className="mt-1" style={style}>
      <svg
        onClick={onClick}
        stroke="currentColor"
        fill={filled ? "currentColor" : "none"}
        strokeWidth="2"
        viewBox="0 0 24 24"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 hover:text-white ml-1"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
      </svg>
    </div>
  );
}
