import React from 'react';
import { cn } from '~/utils/';

export default function CircleDots({ className = '' }: { className?: string }) {
  return (
    <svg
      height="256px"
      width="256px"
      version="1.1"
      id="Capa_1"
      fill="currentColor"
      className={cn('text-black dark:text-white', className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32.055 26"
    >
      <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
      <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <g>
          <path
            className="wave1"
            d="M3.968,12.061C1.775,12.061,0,13.835,0,16.027c0,2.192,1.773,3.967,3.968,3.967c2.189,0,3.966-1.772,3.966-3.967C7.934,13.835,6.157,12.061,3.968,12.061z"
          ></path>
          <path
            className="wave2"
            d="M16.233,12.061c-2.188,0-3.968,1.773-3.968,3.965c0,2.192,1.778,3.967,3.968,3.967s3.97-1.772,3.97-3.967C20.201,13.835,18.423,12.061,16.233,12.061z"
          ></path>
          <path
            className="wave3"
            d="M28.09,12.061c-2.192,0-3.969,1.774-3.969,3.967c0,2.19,1.774,3.965,3.969,3.965c2.188,0,3.965-1.772,3.965-3.965S30.278,12.061,28.09,12.061z"
          ></path>
        </g>
      </g>
    </svg>
  );
}
