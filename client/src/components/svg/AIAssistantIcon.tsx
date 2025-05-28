import React from 'react';
import { cn } from '~/utils';

export default function AIAssistantIcon({ 
  size = 24, 
  className = '',
  animated = false 
}: { 
  size?: number; 
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className, animated && 'animate-pulse')}
    >
      <defs>
        <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1"/>
          <stop offset="33%" stopColor="#8b5cf6"/>
          <stop offset="66%" stopColor="#ec4899"/>
          <stop offset="100%" stopColor="#06b6d4"/>
        </linearGradient>
        <linearGradient id="aiAccent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981"/>
          <stop offset="100%" stopColor="#f59e0b"/>
        </linearGradient>
      </defs>
      
      {/* Main AI head */}
      <circle cx="12" cy="12" r="8" fill="url(#aiGradient)" opacity="0.2"/>
      <circle cx="12" cy="12" r="8" stroke="url(#aiGradient)" strokeWidth="2" fill="none"/>
      
      {/* Neural network pattern */}
      <g stroke="url(#aiAccent)" strokeWidth="1.5" fill="none" opacity="0.7">
        <path d="M8 8 L16 16"/>
        <path d="M16 8 L8 16"/>
        <path d="M12 6 L12 18"/>
        <path d="M6 12 L18 12"/>
      </g>
      
      {/* AI eyes */}
      <g fill="url(#aiGradient)">
        <circle cx="9" cy="10" r="1.5"/>
        <circle cx="15" cy="10" r="1.5"/>
      </g>
      
      {/* AI "mouth" - processing indicator */}
      <rect x="9" y="14" width="6" height="2" rx="1" fill="url(#aiAccent)" opacity="0.8"/>
      
      {/* Data flow indicators */}
      <g fill="url(#aiAccent)" opacity="0.6">
        <circle cx="6" cy="6" r="1"/>
        <circle cx="18" cy="6" r="1"/>
        <circle cx="6" cy="18" r="1"/>
        <circle cx="18" cy="18" r="1"/>
      </g>
      
      {/* Center processing core */}
      <circle cx="12" cy="12" r="2" fill="url(#aiGradient)" opacity="0.3"/>
      <circle cx="12" cy="12" r="1" fill="white"/>
    </svg>
  );
}
