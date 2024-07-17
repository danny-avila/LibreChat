import React from 'react';
import { cn } from '~/utils/';

export default function CircleIcon({
  className = '',
  size = '200',
}: {
  className?: string;
  size?: string;
}) {
  return (
    <svg
      fill="none"
      height={`${size}px`}
      width={`${size}px`}
      className={cn('text-black dark:text-white', className)}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="currentColor" id="SVGRepo_bgCarrier" strokeWidth="0" />
      <g
        fill="currentColor"
        id="SVGRepo_tracerCarrier"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor" id="SVGRepo_iconCarrier">
        <circle cx="128" cy="128" r="81" fillRule="evenodd" />
      </g>
    </svg>
  );
}
