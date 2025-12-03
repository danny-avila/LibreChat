import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '~/utils';

const AnimatedSearchInput = ({
  value,
  onChange,
  isSearching: searching,
  placeholder,
}: {
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isSearching?: boolean;
  placeholder: string;
}) => {
  const isSearching = searching === true;
  const hasValue = value != null && value.length > 0;

  return (
    <div className="relative w-full">
      <div className="relative rounded-lg transition-all duration-500 ease-in-out">
        <div className="relative">
          {/* Icon on the left */}
          <div className="absolute left-3 top-1/2 z-50 -translate-y-1/2">
            <Search
              className={cn(
                `h-4 w-4 transition-all duration-500 ease-in-out`,
                isSearching && hasValue ? 'text-blue-400' : 'text-gray-400',
              )}
            />
          </div>

          {/* Input field */}
          <input
            type="text"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className={`peer relative z-20 w-full rounded-lg bg-surface-secondary px-10 py-2 outline-none backdrop-blur-sm transition-all duration-500 ease-in-out placeholder:text-gray-400 focus:ring-ring`}
          />

          {/* Gradient overlay */}
          <div
            className={`pointer-events-none absolute inset-0 z-20 rounded-lg bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 transition-all duration-500 ease-in-out ${isSearching && hasValue ? 'opacity-100 blur-sm' : 'opacity-0 blur-none'} `}
          />

          {/* Animated loading indicator */}
          <div
            className={`absolute right-3 top-1/2 z-20 -translate-y-1/2 transition-all duration-500 ease-in-out ${isSearching && hasValue ? 'scale-100 opacity-100' : 'scale-0 opacity-0'} `}
          >
            <div className="relative h-2 w-2">
              <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/60" />
              <div className="absolute inset-0 rounded-full bg-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Outer glow effect */}
      <div
        className={`absolute -inset-8 -z-10 transition-all duration-700 ease-in-out ${isSearching && hasValue ? 'scale-105 opacity-100' : 'scale-100 opacity-0'} `}
      >
        <div className="absolute inset-0">
          <div
            className={`bg-gradient-radial absolute inset-0 from-blue-500/10 to-transparent transition-opacity duration-700 ease-in-out ${isSearching && hasValue ? 'animate-pulse-slow opacity-100' : 'opacity-0'} `}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-purple-500/5 blur-xl transition-all duration-700 ease-in-out ${isSearching && hasValue ? 'animate-gradient-x opacity-100' : 'opacity-0'} `}
          />
        </div>
      </div>
      <div
        className={`absolute inset-0 -z-20 scale-100 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 opacity-0 blur-xl transition-all duration-500 ease-in-out peer-focus:scale-105 peer-focus:opacity-100`}
      />
    </div>
  );
};

export default AnimatedSearchInput;
