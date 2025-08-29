/**
 * MultimediaRenderer - Handles rendering of images, videos, and audio content
 * 
 * Features:
 * - URL validation and security checks
 * - Responsive design with proper sizing
 * - Loading states and progressive loading
 * - Error handling with fallback display
 * - Lazy loading for performance
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import type { ContentBlock } from './types';
import { globalLazyLoader } from './utils/LazyLoader';
import { globalCacheManager } from './utils/CacheManager';
import { globalMemoryManager } from './utils/MemoryManager';
import { globalPerformanceMonitor } from './utils/PerformanceMonitor';
import { validateAndSanitizeURL } from './utils/SecurityUtils';
import { checkMultimediaCompatibility } from './utils/BrowserCompatibility';
import { CompatibilityWarning } from './components/CompatibilityWarning';
import { ImagePlaceholder, VideoPlaceholder, AudioPlaceholder } from './components/PlaceholderComponents';
import { 
  globalAccessibilityUtils, 
  getAriaLabels, 
  getKeyboardHandlers, 
  getLiveRegionManager,
  generateAltText 
} from './utils/AccessibilityUtils';

interface MultimediaRendererProps {
  block: ContentBlock;
  className?: string;
}

interface LoadingState {
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
}

const MultimediaRenderer: React.FC<MultimediaRendererProps> = ({
  block,
  className = '',
}) => {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: true,
    hasError: false,
  });
  
  const [isInView, setIsInView] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Accessibility utilities
  const ariaLabels = getAriaLabels();
  const liveRegionManager = getLiveRegionManager();
  const altText = generateAltText(block.type as 'image' | 'video' | 'audio', block.content, block.metadata);

  // Performance-aware lazy loading
  useEffect(() => {
    if (!elementRef.current) return;

    const performanceConfig = globalPerformanceMonitor.getConfig();
    if (!performanceConfig.enableLazyLoading) {
      setIsInView(true);
      return;
    }

    globalLazyLoader.observe(elementRef.current, () => {
      setIsInView(true);
    });

    return () => {
      if (elementRef.current) {
        globalLazyLoader.unobserve(elementRef.current);
      }
    };
  }, []);

  // Memory management and cleanup
  useEffect(() => {
    const mediaId = `multimedia-${block.content}-${Date.now()}`;
    
    return () => {
      // Cleanup when component unmounts
      globalMemoryManager.cleanup(mediaId);
    };
  }, [block.content]);

  // Enhanced URL validation using security utils
  const urlValidation = validateAndSanitizeURL(block.content);
  const compatibilityCheck = checkMultimediaCompatibility();

  // Handle loading success
  const handleLoadSuccess = () => {
    setLoadingState({
      isLoading: false,
      hasError: false,
    });
    
    // Announce successful load to screen readers
    const successMessage = `${block.type} loaded successfully`;
    liveRegionManager.announce(successMessage, 'polite');
  };

  // Handle loading error
  const handleLoadError = (errorMessage: string) => {
    setLoadingState({
      isLoading: false,
      hasError: true,
      errorMessage,
    });
    
    // Announce error to screen readers
    const errorAnnouncement = ariaLabels.multimediaError(block.type, errorMessage);
    liveRegionManager.announceStatus(errorAnnouncement, 'assertive');
  };

  // Render error fallback
  const renderErrorFallback = () => (
    <div 
      className="multimedia-error-fallback p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20"
      role="alert"
      aria-label={ariaLabels.multimediaError(block.type, loadingState.errorMessage || 'Unknown error')}
    >
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
        <svg 
          className="w-5 h-5" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="font-medium">Failed to load {block.type}</span>
      </div>
      <p className="text-sm text-red-600 dark:text-red-400 mb-3">
        {loadingState.errorMessage || `Unable to load ${block.type} content`}
      </p>
      <a
        href={block.content}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
        aria-label={`Open ${block.type} in new tab: ${block.content}`}
      >
        <span>Open in new tab</span>
        <svg 
          className="w-3 h-3" 
          fill="currentColor" 
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
          <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
        </svg>
      </a>
    </div>
  );

  // Render performance-aware loading placeholder
  const renderLoadingPlaceholder = () => {
    const multimediaSettings = globalPerformanceMonitor.getMultimediaSettings();
    
    switch (block.type) {
      case 'image':
        return <ImagePlaceholder className="multimedia-loading-placeholder" />;
      case 'video':
        return <VideoPlaceholder className="multimedia-loading-placeholder" />;
      case 'audio':
        return <AudioPlaceholder className="multimedia-loading-placeholder" />;
      default:
        return (
          <div className="multimedia-loading-placeholder">
            <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center min-h-[200px]">
              <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-sm">Loading {block.type}...</span>
              </div>
            </div>
          </div>
        );
    }
  };

  // Check browser compatibility
  if (!compatibilityCheck.isSupported) {
    return (
      <div ref={elementRef} className={`multimedia-renderer ${className}`}>
        <CompatibilityWarning
          feature="multimedia"
          compatibility={compatibilityCheck}
          showDetails={true}
        />
      </div>
    );
  }

  // Check URL validity and security
  if (!urlValidation.isValid) {
    return (
      <div ref={elementRef} className={`multimedia-renderer ${className}`}>
        <div className="multimedia-error-fallback p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Security Error</span>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">
            {urlValidation.error || 'The provided URL is not valid or not allowed for security reasons.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={elementRef} 
      className={`multimedia-renderer ${className}`}
      role="img"
      aria-label={altText}
    >
      {!isInView ? (
        renderLoadingPlaceholder()
      ) : loadingState.hasError ? (
        renderErrorFallback()
      ) : (
        <div className="multimedia-content">
          {loadingState.isLoading && renderLoadingPlaceholder()}
          
          {block.type === 'image' && (
            <ImageRenderer
              src={urlValidation.sanitizedUrl || block.content}
              onLoad={handleLoadSuccess}
              onError={handleLoadError}
              isLoading={loadingState.isLoading}
              altText={altText}
            />
          )}
          
          {block.type === 'video' && (
            <VideoRenderer
              src={urlValidation.sanitizedUrl || block.content}
              onLoad={handleLoadSuccess}
              onError={handleLoadError}
              isLoading={loadingState.isLoading}
              altText={altText}
            />
          )}
          
          {block.type === 'audio' && (
            <AudioRenderer
              src={urlValidation.sanitizedUrl || block.content}
              onLoad={handleLoadSuccess}
              onError={handleLoadError}
              isLoading={loadingState.isLoading}
              altText={altText}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Image Renderer Component
interface MediaRendererProps {
  src: string;
  onLoad: () => void;
  onError: (message: string) => void;
  isLoading: boolean;
  altText: string;
}

const ImageRenderer: React.FC<MediaRendererProps> = ({ src, onLoad, onError, isLoading, altText }) => {
  const [cachedSrc, setCachedSrc] = useState<string>(src);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const loadImage = async () => {
      try {
        // Check cache first
        const cached = await globalCacheManager.getMultimedia(src);
        if (cached && cached.data instanceof Blob) {
          const blobUrl = URL.createObjectURL(cached.data);
          setCachedSrc(blobUrl);
          onLoad();
          return;
        }

        // Load from network
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        // Cache the image
        await globalCacheManager.setMultimedia(src, blob, 'image', blob.size);
        
        // Track in memory manager
        const mediaId = `image-${src}-${Date.now()}`;
        globalMemoryManager.track(mediaId, 'multimedia', { 
          element: imgRef.current,
          blobUrl 
        }, blob.size);
        
        setCachedSrc(blobUrl);
        onLoad();
      } catch (error) {
        onError('Image failed to load. The file may be corrupted or the server may be unavailable.');
      }
    };

    loadImage();
  }, [src, onLoad, onError]);

  const handleError = () => {
    onError('Image failed to load. The file may be corrupted or the server may be unavailable.');
  };

  const multimediaSettings = globalPerformanceMonitor.getMultimediaSettings();

  return (
    <img
      ref={imgRef}
      src={cachedSrc}
      alt={altText}
      className={`multimedia-image max-w-full h-auto rounded-lg shadow-sm transition-opacity duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isLoading ? 'opacity-0' : 'opacity-100'
      }`}
      loading="lazy"
      onError={handleError}
      tabIndex={0}
      role="img"
      aria-describedby={`image-description-${src.split('/').pop()?.split('?')[0]}`}
      style={{
        maxHeight: '70vh',
        maxWidth: `${multimediaSettings.maxImageSize}px`,
        objectFit: 'contain',
      }}
    />
  );
};

// Video Renderer Component
const VideoRenderer: React.FC<MediaRendererProps> = ({ src, onLoad, onError, isLoading, altText }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const multimediaSettings = globalPerformanceMonitor.getMultimediaSettings();

  useEffect(() => {
    const mediaId = `video-${src}-${Date.now()}`;
    
    if (videoRef.current) {
      globalMemoryManager.track(mediaId, 'multimedia', { 
        element: videoRef.current 
      }, 5 * 1024 * 1024); // Estimate 5MB for video
    }

    return () => {
      globalMemoryManager.cleanup(mediaId);
    };
  }, [src]);

  const handleLoadedData = () => {
    onLoad();
  };

  const handleError = () => {
    onError('Video failed to load. The format may not be supported or the server may be unavailable.');
  };

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      preload={multimediaSettings.enableVideoPreload ? "metadata" : "none"}
      className={`multimedia-video max-w-full h-auto rounded-lg shadow-sm transition-opacity duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        isLoading ? 'opacity-0' : 'opacity-100'
      }`}
      onLoadedData={handleLoadedData}
      onError={handleError}
      aria-label={altText}
      aria-describedby={`video-description-${src.split('/').pop()?.split('?')[0]}`}
      style={{
        maxHeight: '70vh',
      }}
    >
      <track kind="captions" label="English captions" srcLang="en" />
      <track kind="descriptions" label="Audio descriptions" srcLang="en" />
      <p>
        Your browser does not support the video tag. 
        <a href={src} target="_blank" rel="noopener noreferrer">
          Download the video file
        </a>
      </p>
    </video>
  );
};

// Audio Renderer Component
const AudioRenderer: React.FC<MediaRendererProps> = ({ src, onLoad, onError, isLoading, altText }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const multimediaSettings = globalPerformanceMonitor.getMultimediaSettings();

  useEffect(() => {
    const mediaId = `audio-${src}-${Date.now()}`;
    
    if (audioRef.current) {
      globalMemoryManager.track(mediaId, 'multimedia', { 
        element: audioRef.current 
      }, 3 * 1024 * 1024); // Estimate 3MB for audio
    }

    return () => {
      globalMemoryManager.cleanup(mediaId);
    };
  }, [src]);

  const handleLoadedData = () => {
    onLoad();
  };

  const handleError = () => {
    onError('Audio failed to load. The format may not be supported or the server may be unavailable.');
  };

  return (
    <div className="multimedia-audio-container">
      <audio
        ref={audioRef}
        src={src}
        controls
        preload={multimediaSettings.enableAudioPreload ? "metadata" : "none"}
        className={`multimedia-audio w-full max-w-md transition-opacity duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        }`}
        onLoadedData={handleLoadedData}
        onError={handleError}
        aria-label={altText}
        aria-describedby={`audio-description-${src.split('/').pop()?.split('?')[0]}`}
      >
        <p>
          Your browser does not support the audio tag. 
          <a href={src} target="_blank" rel="noopener noreferrer">
            Download the audio file
          </a>
        </p>
      </audio>
    </div>
  );
};

export { MultimediaRenderer };
export default memo(MultimediaRenderer);