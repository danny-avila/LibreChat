/**
 * Placeholder components for progressive loading
 * Provides loading states while content is being fetched or processed
 */

import React from 'react';

interface PlaceholderProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Generic shimmer effect for loading states
 */
const ShimmerEffect: React.FC<PlaceholderProps> = ({ className = '', style }) => (
  <div 
    className={`animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%] ${className}`}
    style={{
      animation: 'shimmer 1.5s ease-in-out infinite',
      ...style,
    }}
  />
);

/**
 * Image placeholder with shimmer effect
 */
export const ImagePlaceholder: React.FC<PlaceholderProps & { 
  width?: number; 
  height?: number;
  alt?: string;
}> = ({ 
  className = '', 
  width = 300, 
  height = 200, 
  alt = 'Loading image...',
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border ${className}`}
    style={{ width, height, ...style }}
    role="img"
    aria-label={alt}
  >
    <ShimmerEffect className="absolute inset-0" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-gray-500 text-sm">
        <svg 
          className="w-8 h-8 mx-auto mb-2" 
          fill="currentColor" 
          viewBox="0 0 20 20"
        >
          <path 
            fillRule="evenodd" 
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" 
            clipRule="evenodd" 
          />
        </svg>
        Loading...
      </div>
    </div>
  </div>
);

/**
 * Video placeholder with play button
 */
export const VideoPlaceholder: React.FC<PlaceholderProps & { 
  width?: number; 
  height?: number;
}> = ({ 
  className = '', 
  width = 400, 
  height = 225,
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border bg-gray-100 ${className}`}
    style={{ width, height, ...style }}
    role="img"
    aria-label="Loading video..."
  >
    <ShimmerEffect className="absolute inset-0" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-gray-500 text-center">
        <div className="w-16 h-16 mx-auto mb-2 bg-gray-300 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            <path 
              fillRule="evenodd" 
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" 
              clipRule="evenodd" 
            />
          </svg>
        </div>
        <div className="text-sm">Loading video...</div>
      </div>
    </div>
  </div>
);

/**
 * Audio placeholder with waveform
 */
export const AudioPlaceholder: React.FC<PlaceholderProps> = ({ 
  className = '',
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border bg-gray-50 p-4 ${className}`}
    style={{ minWidth: 300, ...style }}
    role="img"
    aria-label="Loading audio..."
  >
    <div className="flex items-center space-x-3">
      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
        <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
          <path 
            fillRule="evenodd" 
            d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.816L4.617 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.617l3.766-3.816a1 1 0 011.617.816zM16 8a2 2 0 11-4 0 2 2 0 014 0z" 
            clipRule="evenodd" 
          />
        </svg>
      </div>
      <div className="flex-1">
        <div className="flex items-center space-x-1 mb-2">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i}
              className="w-1 bg-gray-300 rounded animate-pulse"
              style={{ 
                height: Math.random() * 20 + 10,
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
        <div className="text-sm text-gray-500">Loading audio...</div>
      </div>
    </div>
  </div>
);

/**
 * Chart placeholder with grid
 */
export const ChartPlaceholder: React.FC<PlaceholderProps & { 
  width?: number; 
  height?: number;
  type?: 'bar' | 'line' | 'pie' | 'scatter';
}> = ({ 
  className = '', 
  width = 400, 
  height = 300,
  type = 'bar',
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border bg-white p-4 ${className}`}
    style={{ width, height, ...style }}
    role="img"
    aria-label={`Loading ${type} chart...`}
  >
    <ShimmerEffect className="absolute inset-0" />
    <div className="relative z-10">
      <div className="h-6 bg-gray-200 rounded mb-4 w-1/3" />
      {type === 'pie' ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-32 h-32 border-8 border-gray-200 rounded-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-end space-x-2 h-8">
              {[...Array(6)].map((_, j) => (
                <div 
                  key={j}
                  className="bg-gray-200 rounded-t"
                  style={{ 
                    width: '20px',
                    height: `${Math.random() * 60 + 20}%`
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
    <div className="absolute bottom-4 left-4 text-sm text-gray-500">
      Loading {type} chart...
    </div>
  </div>
);

/**
 * Widget placeholder with code icon
 */
export const WidgetPlaceholder: React.FC<PlaceholderProps & { 
  type?: 'react' | 'html';
}> = ({ 
  className = '', 
  type = 'react',
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border bg-gray-50 p-6 ${className}`}
    style={{ minHeight: 200, ...style }}
    role="img"
    aria-label={`Loading ${type} widget...`}
  >
    <ShimmerEffect className="absolute inset-0" />
    <div className="relative z-10 text-center">
      <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-lg flex items-center justify-center">
        <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path 
            fillRule="evenodd" 
            d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" 
            clipRule="evenodd" 
          />
        </svg>
      </div>
      <div className="text-gray-500">
        <div className="text-lg font-medium mb-2">Loading Widget</div>
        <div className="text-sm">Preparing {type} environment...</div>
      </div>
    </div>
  </div>
);

/**
 * Code execution placeholder
 */
export const CodePlaceholder: React.FC<PlaceholderProps & { 
  language?: string;
}> = ({ 
  className = '', 
  language = 'javascript',
  style 
}) => (
  <div 
    className={`relative overflow-hidden rounded-lg border bg-gray-900 text-white ${className}`}
    style={{ minHeight: 150, ...style }}
    role="img"
    aria-label={`Loading ${language} code...`}
  >
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-400">{language}</div>
        <div className="w-20 h-6 bg-gray-700 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex space-x-2">
            <div className="w-6 text-gray-500 text-sm">{i + 1}</div>
            <div 
              className="bg-gray-700 rounded h-4 animate-pulse"
              style={{ width: `${Math.random() * 60 + 40}%` }}
            />
          </div>
        ))}
      </div>
    </div>
    <div className="absolute bottom-4 right-4 text-xs text-gray-400">
      Loading code...
    </div>
  </div>
);

/**
 * Generic content placeholder
 */
export const ContentPlaceholder: React.FC<PlaceholderProps & { 
  lines?: number;
  width?: string;
}> = ({ 
  className = '', 
  lines = 3,
  width = '100%',
  style 
}) => (
  <div className={`space-y-2 ${className}`} style={{ width, ...style }}>
    {[...Array(lines)].map((_, i) => (
      <div 
        key={i}
        className="h-4 bg-gray-200 rounded animate-pulse"
        style={{ 
          width: i === lines - 1 ? '60%' : '100%'
        }}
      />
    ))}
  </div>
);

// CSS for shimmer animation (to be added to enhanced-content.css)
export const shimmerCSS = `
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
`;