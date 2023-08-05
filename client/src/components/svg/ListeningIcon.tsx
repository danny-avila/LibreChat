import React from 'react';

export default function ListeningIcon() {
  return (
    <svg
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      viewBox="0 0 24 24"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-1 h-4 w-4"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="4" width="8" height="12" stroke="currentColor" fill="currentColor" />
      <circle cx="12" cy="4" r="4" stroke="currentColor" fill="currentColor" />
      <rect x="10" y="16" width="4" height="6" stroke="currentColor" fill="currentColor" />
      <line x1="4" y1="22" x2="20" y2="22" stroke="currentColor" />
      <circle cx="18" cy="18" r="6" fill="red" />
    </svg>
  );
}
