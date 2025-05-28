import React from 'react';
import { cn } from '~/utils';

export default function LoadingDotsIcon({ 
  size = 24, 
  className = '' 
}: { 
  size?: number; 
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
    >
      <defs>
        <linearGradient id="loadingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1"/>
          <stop offset="50%" stopColor="#8b5cf6"/>
          <stop offset="100%" stopColor="#ec4899"/>
        </linearGradient>
      </defs>
      
      <g fill="url(#loadingGradient)">
        <circle cx="6" cy="12" r="2">
          <animate 
            attributeName="opacity" 
            values="0.3;1;0.3" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0s"
          />
          <animate 
            attributeName="r" 
            values="2;3;2" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0s"
          />
        </circle>
        <circle cx="12" cy="12" r="2">
          <animate 
            attributeName="opacity" 
            values="0.3;1;0.3" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0.2s"
          />
          <animate 
            attributeName="r" 
            values="2;3;2" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0.2s"
          />
        </circle>
        <circle cx="18" cy="12" r="2">
          <animate 
            attributeName="opacity" 
            values="0.3;1;0.3" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0.4s"
          />
          <animate 
            attributeName="r" 
            values="2;3;2" 
            dur="1.4s" 
            repeatCount="indefinite"
            begin="0.4s"
          />
        </circle>
      </g>
    </svg>
  );
}
