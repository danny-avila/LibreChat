import { useCallback, useRef } from 'react';
import { useToastContext, TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize, useSpeechToText } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { globalAudioId } from '~/common';
import { cn } from '~/utils';

/**
 * AudioRecorder component provides a microphone button for speech-to-text functionality.
 * 
 * Features:
 * - Visual feedback for recording, loading, and idle states
 * - Integration with both browser and external STT services
 * - Automatic form submission when transcription completes
 * - Double-click to clear accumulated text
 * - Toast notifications for user feedback
 * - Accessibility support with proper ARIA labels
 * 
 * @param disabled - Whether the recorder should be disabled
 * @param ask - Function to submit the transcribed text
 * @param methods - Form methods from react-hook-form
 * @param textAreaRef - Reference to the text area element
 * @param isSubmitting - Whether a form submission is in progress
 */
export default function AudioRecorder({
  disabled,
  ask,
  methods,
  textAreaRef,
  isSubmitting,
}: {
  disabled: boolean;
  ask: (data: { text: string }) => void;
  methods: ReturnType<typeof useChatFormContext>;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  isSubmitting: boolean;
}) {
  // Form control methods from react-hook-form
  const { setValue, reset } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();

  /**
   * Callback executed when speech transcription is complete.
   * Handles form submission and audio state management.
   */
  const onTranscriptionComplete = useCallback(
    (text: string) => {
      // Prevent submission during ongoing form submission
      if (isSubmitting) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      
      if (text) {
        // Re-enable global audio that may have been muted during recording
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        
        // Submit the transcribed text and reset the form
        ask({ text });
        reset({ text: '' });
      }
    },
    [ask, reset, showToast, localize, isSubmitting],
  );

  /**
   * Callback to update the text input field with transcribed text.
   * Uses react-hook-form's setValue with validation enabled.
   */
  const setText = useCallback(
    (text: string) => {
      setValue('text', text, {
        shouldValidate: true, // Trigger form validation
      });
    },
    [setValue],
  );

  // Initialize speech-to-text functionality with callbacks
  const { isListening, isLoading, startRecording, stopRecording, clearAccumulatedText } = useSpeechToText(
    setText,
    onTranscriptionComplete,
  );

  // Don't render if text area reference is not available
  if (!textAreaRef.current) {
    return null;
  }

  // Refs for handling click/double-click with debouncing
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTime = useRef<number>(0);
  
  // Wrapper functions for recording control
  const handleStartRecording = async () => startRecording();
  const handleStopRecording = async () => stopRecording();

  /**
   * Handle click with debouncing to differentiate single vs double click.
   * Supports both desktop double-click and mobile double-tap.
   */
  const handleClick = useCallback(() => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    // Mobile double-tap detection (within 300ms)
    if (timeSinceLastTap < 300) {
      // This is a double-tap/double-click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      
      // Clear accumulated text
      if (clearAccumulatedText) {
        clearAccumulatedText();
        showToast({
          message: localize('com_ui_speech_text_cleared'),
          status: 'success',
        });
      }
      
      lastTapTime.current = 0;
    } else {
      // Potential single click - wait to see if it's a double
      lastTapTime.current = now;
      
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      
      clickTimeoutRef.current = setTimeout(() => {
        // This is a single click - toggle recording
        if (isListening === true) {
          handleStopRecording();
        } else {
          handleStartRecording();
        }
        
        lastTapTime.current = 0;
      }, 300); // Wait 300ms to determine if it's a double-click
    }
  }, [isListening, clearAccumulatedText, showToast, localize, handleStartRecording, handleStopRecording]);
  
  /**
   * Handle traditional double-click event for desktop browsers.
   * This is kept for better desktop compatibility.
   */
  const handleDoubleClick = useCallback(() => {
    // Clear any pending single-click action
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    if (clearAccumulatedText) {
      clearAccumulatedText();
      showToast({
        message: localize('com_ui_speech_text_cleared'),
        status: 'success',
      });
    }
  }, [clearAccumulatedText, showToast, localize]);

  /**
   * Render the appropriate icon based on current recording state.
   * - Red microphone icon when actively listening
   * - Spinner when processing audio
   * - Gray microphone icon when idle
   */
  const renderIcon = () => {
    if (isListening === true) {
      // Active recording state - red microphone
      return <ListeningIcon className="stroke-red-500" />;
    }
    if (isLoading === true) {
      // Processing state - loading spinner
      return <Spinner className="stroke-gray-700 dark:stroke-gray-300" />;
    }
    // Idle state - gray microphone
    return <ListeningIcon className="stroke-gray-700 dark:stroke-gray-300" />;
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onTouchEnd={(e) => {
            // Prevent ghost clicks on mobile
            e.preventDefault();
            handleClick();
          }}
          disabled={disabled}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          )}
          title={localize('com_ui_use_micrphone')}
          aria-pressed={isListening}
        >
          {renderIcon()}
        </button>
      }
    />
  );
}
