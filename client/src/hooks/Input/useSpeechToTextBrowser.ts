import { useEffect, useRef, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import useGetAudioSettings from './useGetAudioSettings';
import store from '~/store';

/**
 * Browser-based speech-to-text hook using the Web Speech API.
 * This implementation provides real-time transcription with configurable
 * silence timeout, text accumulation, and automatic sending capabilities.
 * 
 * Features:
 * - Real-time interim and final transcript updates
 * - Text accumulation across multiple recording sessions
 * - Configurable auto-send after silence timeout
 * - Keyboard shortcut support (Shift + Alt + L)
 * - Language selection support
 * - Continuous recording mode
 * 
 * @param setText - Callback to update the text input field with transcribed text
 * @param onTranscriptionComplete - Callback called when transcription is complete
 * @returns Object containing recording state and control functions
 */
const useSpeechToTextBrowser = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const isBrowserSTTEnabled = speechToTextEndpoint === 'browser';

  // Refs to track previous transcript states and prevent duplicate processing
  const lastTranscript = useRef<string | null>(null);
  const lastInterim = useRef<string | null>(null);
  // Timeout for auto-send functionality after silence period
  const timeoutRef = useRef<NodeJS.Timeout | null>();
  // Accumulated text across multiple recording sessions
  const accumulatedText = useRef<string>('');
  
  // User settings from Recoil store
  const [autoSendText] = useRecoilState(store.autoSendText); // Auto-send timeout in seconds (-1 = disabled)
  const [languageSTT] = useRecoilState<string>(store.languageSTT); // Language code for recognition
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio); // Continuous mode flag

  // Web Speech API integration via react-speech-recognition
  const {
    listening, // Current listening state from the API
    finalTranscript, // Completed transcription text
    resetTranscript, // Function to clear transcript
    interimTranscript, // Real-time partial transcription
    isMicrophoneAvailable, // Microphone permission status
    browserSupportsSpeechRecognition, // Browser capability check
  } = useSpeechRecognition();
  // Memoized listening state to prevent unnecessary re-renders
  const isListening = useMemo(() => listening, [listening]);

  /**
   * Handle interim transcript updates for real-time display.
   * Combines accumulated text with current interim results.
   */
  useEffect(() => {
    // Skip empty or null interim transcripts
    if (interimTranscript == null || interimTranscript === '') {
      return;
    }

    // Prevent duplicate processing of the same interim transcript
    if (lastInterim.current === interimTranscript) {
      return;
    }

    // Combine accumulated text with current interim transcript
    const combinedText = accumulatedText.current + (accumulatedText.current ? ' ' : '') + interimTranscript;
    setText(combinedText);
    lastInterim.current = interimTranscript;
  }, [setText, interimTranscript]);

  /**
   * Handle final transcript updates and auto-send functionality.
   * Manages text accumulation and automatic submission after silence timeout.
   */
  useEffect(() => {
    // Skip empty or null final transcripts
    if (finalTranscript == null || finalTranscript === '') {
      return;
    }

    // Prevent duplicate processing of the same final transcript
    if (lastTranscript.current === finalTranscript) {
      return;
    }

    // Properly accumulate text instead of replacing it
    // The finalTranscript contains all text since the last resetTranscript()
    // so we should use it directly as the accumulated text
    if (finalTranscript.trim()) {
      accumulatedText.current = finalTranscript;
      setText(finalTranscript);
    }
    
    lastTranscript.current = finalTranscript;
    
    // Set up auto-send timer if enabled (autoSendText > -1 means enabled)
    if (autoSendText > -1 && finalTranscript.length > 0) {
      timeoutRef.current = setTimeout(() => {
        onTranscriptionComplete(accumulatedText.current);
        // Clear accumulated text only after successful submission
        accumulatedText.current = '';
        resetTranscript();
      }, autoSendText * 1000); // Convert seconds to milliseconds
    }

    // Cleanup timeout on component unmount or dependency change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [setText, onTranscriptionComplete, resetTranscript, finalTranscript, autoSendText]);

  /**
   * Toggle speech recognition on/off with proper error handling.
   * Performs capability checks and manages recording lifecycle.
   */
  const toggleListening = () => {
    // Check browser support for Web Speech API
    if (!browserSupportsSpeechRecognition) {
      showToast({
        message: 'Browser does not support SpeechRecognition',
        status: 'error',
      });
      return;
    }

    // Check microphone availability and permissions
    if (!isMicrophoneAvailable) {
      showToast({
        message: 'Microphone is not available',
        status: 'error',
      });
      return;
    }

    if (isListening === true) {
      // Stop current recording session
      SpeechRecognition.stopListening();
    } else {
      // Start new recording session
      // Don't clear accumulated text - we want to preserve it across sessions
      // Only clear the transcript to start fresh recognition
      resetTranscript();
      SpeechRecognition.startListening({
        language: languageSTT, // Use configured language
        continuous: autoTranscribeAudio, // Enable continuous mode if configured
      });
    }
  };

  /**
   * Clear all accumulated text and reset the transcript state.
   * Used for manual text clearing via double-click or other triggers.
   */
  const clearAccumulatedText = () => {
    accumulatedText.current = '';
    resetTranscript();
    setText('');
  };

  /**
   * Set up keyboard shortcut for toggling speech recognition.
   * Shortcut: Shift + Alt + L (only when browser STT is not the active endpoint)
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcut when browser STT is not the active endpoint
      if (e.shiftKey && e.altKey && e.code === 'KeyL' && !isBrowserSTTEnabled) {
        toggleListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isListening,
    isLoading: false,
    startRecording: toggleListening,
    stopRecording: toggleListening,
    clearAccumulatedText,
  };
};

export default useSpeechToTextBrowser;
