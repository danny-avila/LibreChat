import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { TTSEngine, TTSState } from './TTSEngine';
import { globalMemoryManager } from './utils/MemoryManager';
import { globalPerformanceMonitor } from './utils/PerformanceMonitor';
import { checkTTSCompatibility } from './utils/BrowserCompatibility';
import { CompatibilityWarning } from './components/CompatibilityWarning';
import { 
  globalAccessibilityUtils, 
  getAriaLabels, 
  getKeyboardHandlers, 
  getLiveRegionManager,
  prefersReducedMotion 
} from './utils/AccessibilityUtils';

interface TTSRendererProps {
  text: string;
  language: string;
  className?: string;
}

/**
 * TTSRenderer - Renders clickable text with TTS functionality
 * Provides visual feedback during speech playback and handles user interactions
 */
export const TTSRenderer: React.FC<TTSRendererProps> = ({
  text,
  language,
  className = '',
}) => {
  const [ttsState, setTtsState] = useState<TTSState>({
    isPlaying: false,
    currentText: '',
    currentLanguage: '',
    currentUtterance: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isFocused, setIsFocused] = useState(false);

  const ttsEngine = TTSEngine.getInstance();
  const textElementRef = useRef<HTMLSpanElement>(null);
  const buttonElementRef = useRef<HTMLButtonElement>(null);
  
  // Accessibility utilities
  const ariaLabels = getAriaLabels();
  const keyboardHandlers = getKeyboardHandlers();
  const liveRegionManager = getLiveRegionManager();
  const reducedMotion = prefersReducedMotion();

  // Check TTS support and performance constraints on mount
  useEffect(() => {
    const performanceConfig = globalPerformanceMonitor.getConfig();
    const compatibilityCheck = checkTTSCompatibility();
    const isTTSEnabled = performanceConfig.enableTTS && ttsEngine.isSupported() && compatibilityCheck.isSupported;
    setIsSupported(isTTSEnabled);
    
    if (!compatibilityCheck.isSupported) {
      setError(compatibilityCheck.fallbackMessage || 'TTS is not supported in your browser');
    }
  }, [ttsEngine]);

  // Subscribe to TTS state changes and manage memory
  useEffect(() => {
    const handleStateChange = (state: TTSState) => {
      const wasPlaying = ttsState.isPlaying;
      const isNowPlaying = state.isPlaying;
      
      setTtsState(state);
      setIsLoading(false);
      
      // Announce TTS status changes to screen readers
      if (wasPlaying !== isNowPlaying) {
        const statusMessage = ariaLabels.ttsStatus(isNowPlaying, state.currentText);
        liveRegionManager.announceStatus(statusMessage, 'polite');
      }
      
      // Track TTS utterance in memory manager
      if (state.currentUtterance) {
        const ttsId = `tts-${text}-${language}-${Date.now()}`;
        globalMemoryManager.track(ttsId, 'tts', state.currentUtterance, 1024);
      }
    };

    ttsEngine.onStateChange(handleStateChange);
    
    // Get initial state
    setTtsState(ttsEngine.getState());

    return () => {
      // Cleanup TTS resources
      globalMemoryManager.cleanupByType('tts');
    };
  }, [ttsEngine, text, language, ttsState.isPlaying, ariaLabels, liveRegionManager]);

  const handleTTSClick = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'Text-to-speech is not supported in this browser';
      setError(errorMsg);
      liveRegionManager.announceStatus(errorMsg, 'assertive');
      return;
    }

    setError(null);

    // If currently speaking this text, stop it
    if (ttsEngine.isSpeaking(text)) {
      ttsEngine.stop();
      liveRegionManager.announceStatus('Text-to-speech stopped', 'polite');
      return;
    }

    // If speaking something else, stop it first
    if (ttsState.isPlaying) {
      ttsEngine.stop();
    }

    setIsLoading(true);
    liveRegionManager.announceStatus(`Starting to read: ${text}`, 'polite');

    try {
      await ttsEngine.speak(text, language);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to play text-to-speech';
      setError(errorMsg);
      setIsLoading(false);
      liveRegionManager.announceStatus(`Error: ${errorMsg}`, 'assertive');
    }
  }, [text, language, isSupported, ttsState.isPlaying, ttsEngine, liveRegionManager]);

  const isCurrentlyPlaying = ttsEngine.isSpeaking(text);
  const showError = error && !isLoading;

  // Determine icon to show
  const getIcon = () => {
    if (isLoading) {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (isCurrentlyPlaying) {
      return <VolumeX className="w-4 h-4" />;
    }
    return <Volume2 className="w-4 h-4" />;
  };

  // Get accessible button label
  const getButtonLabel = () => ariaLabels.ttsButton(text, language, isCurrentlyPlaying);
  
  // Get accessible text label
  const getTextLabel = () => ariaLabels.ttsText(text, language);

  // Handle keyboard navigation
  const handleKeyDown = keyboardHandlers.onEnterOrSpace(handleTTSClick);

  // Handle focus events for better accessibility
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  return (
    <span 
      className={`tts-container inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label={`Text-to-speech controls for: ${text}`}
    >
      <span 
        ref={textElementRef}
        className={`
          tts-text cursor-pointer relative transition-all duration-200
          ${isCurrentlyPlaying ? 'tts-text-playing' : 'tts-text-idle'}
          ${!isSupported ? 'tts-text-disabled' : ''}
          ${isFocused ? 'tts-text-focused' : ''}
          ${reducedMotion ? 'tts-text-no-animation' : ''}
        `}
        onClick={handleTTSClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onTouchStart={(e) => {
          // Prevent double-tap zoom on mobile
          e.currentTarget.style.touchAction = 'manipulation';
        }}
        role="button"
        tabIndex={isSupported ? 0 : -1}
        aria-label={getTextLabel()}
        aria-describedby={showError ? `tts-error-${text.replace(/\s+/g, '-')}` : undefined}
        aria-pressed={isCurrentlyPlaying}
        aria-disabled={!isSupported}
        data-touch-feedback="true"
      >
        {text}
        {isCurrentlyPlaying && !reducedMotion && (
          <span 
            className="tts-highlight-overlay absolute inset-0 pointer-events-none"
            aria-hidden="true"
          />
        )}
      </span>
      
      <button
        ref={buttonElementRef}
        onClick={handleTTSClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={!isSupported || isLoading}
        className={`
          tts-button inline-flex items-center justify-center
          w-6 h-6 rounded-sm transition-all duration-200
          ${!isSupported ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}
          ${isCurrentlyPlaying ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}
          ${isFocused ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
        `}
        aria-label={getButtonLabel()}
        aria-describedby={showError ? `tts-error-${text.replace(/\s+/g, '-')}` : undefined}
        aria-pressed={isCurrentlyPlaying}
        onTouchStart={(e) => {
          // Prevent double-tap zoom on mobile
          e.currentTarget.style.touchAction = 'manipulation';
        }}
        data-touch-feedback="true"
      >
        {getIcon()}
        <span className="sr-only">
          {isLoading ? 'Loading text-to-speech' : 
           isCurrentlyPlaying ? 'Stop text-to-speech' : 
           'Start text-to-speech'}
        </span>
      </button>

      {showError && !isSupported && (
        <CompatibilityWarning
          feature="tts"
          compatibility={checkTTSCompatibility()}
          className="ml-2"
        />
      )}
      
      {showError && isSupported && (
        <span 
          id={`tts-error-${text.replace(/\s+/g, '-')}`}
          className="tts-error text-xs text-red-500 dark:text-red-400 ml-1"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </span>
      )}

      {/* Hidden status for screen readers */}
      <span 
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true"
      >
        {isCurrentlyPlaying ? `Currently reading: ${text}` : ''}
      </span>
    </span>
  );
};

export default TTSRenderer;