import React, { useState } from 'react';
import { Search } from 'lucide-react';

const AnimatedSearchInput = ({ value, onChange, isSearching, placeholder }) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative w-full">
      <div className="relative rounded-lg transition-all duration-500 ease-in-out">
        {/* Background gradient effect */}
        <div
          className={`
            absolute inset-0 rounded-lg
            bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20
            transition-all duration-500 ease-in-out
            ${isSearching ? 'opacity-100 blur-sm' : 'opacity-0 blur-none'}
          `}
        />

        <div className="relative">
          <div className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <Search
              className={`
                h-4 w-4 transition-all duration-500 ease-in-out
                ${isFocused ? 'text-blue-500' : 'text-gray-400'}
                ${isSearching ? 'text-blue-400' : ''}
              `}
            />
          </div>

          {/* Input field with background transitions */}
          <input
            type="text"
            value={value}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={`
              w-full rounded-lg px-10 py-2
              transition-all duration-500 ease-in-out
              placeholder:text-gray-400
              focus:outline-none focus:ring-0
              ${isFocused ? 'bg-white/10' : 'bg-white/5'}
              ${isSearching ? 'bg-white/15' : ''}
              backdrop-blur-sm
            `}
          />

          {/* Animated loading indicator */}
          <div
            className={`
              absolute right-3 top-1/2 -translate-y-1/2
              transition-all duration-500 ease-in-out
              ${isSearching ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
            `}
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
        className={`
          absolute -inset-8 -z-10
          transition-all duration-700 ease-in-out
          ${isSearching ? 'opacity-100 scale-105' : 'opacity-0 scale-100'}
        `}
      >
        <div className="absolute inset-0">
          <div 
            className={`
              absolute inset-0 bg-gradient-radial from-blue-500/10 to-transparent
              transition-opacity duration-700 ease-in-out
              ${isSearching ? 'animate-pulse-slow opacity-100' : 'opacity-0'}
            `}
          />
          <div 
            className={`
              absolute inset-0 bg-gradient-to-r from-purple-500/5 via-blue-500/5 to-purple-500/5
              blur-xl transition-all duration-700 ease-in-out
              ${isSearching ? 'animate-gradient-x opacity-100' : 'opacity-0'}
            `}
          />
        </div>
      </div>

      {/* Focus state background glow */}
      <div
        className={`
          absolute inset-0 -z-20 bg-gradient-to-r from-blue-500/10
          via-purple-500/10 to-blue-500/10 blur-xl
          transition-all duration-500 ease-in-out
          ${isFocused ? 'scale-105 opacity-100' : 'scale-100 opacity-0'}
        `}
      />
    </div>
  );
};

export default AnimatedSearchInput;