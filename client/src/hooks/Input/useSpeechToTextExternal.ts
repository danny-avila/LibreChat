import { useState, useEffect, useRef } from 'react';
import { useRecoilState } from 'recoil';
import { useToastContext } from '@librechat/client';
import { useSpeechToTextMutation } from '~/data-provider';
import useGetAudioSettings from './useGetAudioSettings';
import store from '~/store';

/**
 * External speech-to-text hook using server-side transcription services.
 * This implementation records audio using MediaRecorder API and sends it
 * to an external service (e.g., OpenAI Whisper) for transcription.
 * 
 * Features:
 * - Audio recording with configurable MIME types
 * - Silence detection and automatic stop recording
 * - Text accumulation across multiple recordings
 * - Configurable auto-send after transcription
 * - Cross-browser audio format compatibility
 * - Real-time audio level monitoring
 * - Keyboard shortcut support (Shift + Alt + L)
 * 
 * @param setText - Callback to update the text input field with transcribed text
 * @param onTranscriptionComplete - Callback called when transcription is complete
 * @returns Object containing recording state and control functions
 */
const useSpeechToTextExternal = (
  setText: (text: string) => void,
  onTranscriptionComplete: (text: string) => void,
) => {
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();
  const isExternalSTTEnabled = speechToTextEndpoint === 'external';
  
  // Refs for managing audio recording and processing
  const audioStream = useRef<MediaStream | null>(null); // Current media stream
  const animationFrameIdRef = useRef<number | null>(null); // Animation frame for silence detection
  const audioContextRef = useRef<AudioContext | null>(null); // Audio context for analysis
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // MediaRecorder instance
  const accumulatedText = useRef<string>(''); // Text accumulated across recordings

  // Component state
  const [permission, setPermission] = useState(false); // Microphone permission status
  const [isListening, setIsListening] = useState(false); // Current recording state
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]); // Recorded audio chunks
  const [isRequestBeingMade, setIsRequestBeingMade] = useState(false); // API request in progress
  const [audioMimeType, setAudioMimeType] = useState<string>(() => getBestSupportedMimeType()); // Audio format
  const [permissionError, setPermissionError] = useState<string | null>(null); // Permission error message

  // User settings from Recoil store
  const [minDecibels] = useRecoilState(store.decibelValue); // Silence detection sensitivity
  const [autoSendText] = useRecoilState(store.autoSendText); // Auto-send timeout in seconds
  const [speechToText] = useRecoilState<boolean>(store.speechToText); // STT feature enabled
  const [autoTranscribeAudio] = useRecoilState<boolean>(store.autoTranscribeAudio); // Auto-stop on silence
  const [silenceTimeoutMs] = useRecoilState<number>(store.silenceTimeoutMs); // Silence timeout duration

  /**
   * Mutation hook for sending audio to external transcription service.
   * Handles success/error states and manages text accumulation.
   * Includes retry logic for network failures.
   */
  const { mutate: processAudio, isLoading: isProcessing } = useSpeechToTextMutation({
    onSuccess: (data) => {
      const extractedText = data.text;
      // Accumulate text from multiple recordings with proper spacing
      const newText = accumulatedText.current + (accumulatedText.current ? ' ' : '') + extractedText;
      accumulatedText.current = newText;
      setText(newText);
      setIsRequestBeingMade(false);

      // Auto-send transcribed text if enabled
      if (autoSendText > -1 && speechToText && newText.length > 0) {
        setTimeout(() => {
          onTranscriptionComplete(newText);
          // Clear accumulated text after successful submission
          accumulatedText.current = '';
        }, autoSendText * 1000); // Convert seconds to milliseconds
      }
    },
    onError: (error: any) => {
      setIsRequestBeingMade(false);
      
      // Handle different error types
      if (error?.response?.status === 413) {
        showToast({
          message: 'Audio file is too large. Please record a shorter segment.',
          status: 'error',
        });
      } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        showToast({
          message: 'Request timed out. Please check your connection and try again.',
          status: 'error',
        });
      } else if (!navigator.onLine) {
        showToast({
          message: 'No internet connection. Please check your network and try again.',
          status: 'error',
        });
      } else {
        showToast({
          message: 'Failed to transcribe audio. Please try again.',
          status: 'error',
        });
      }
    },
    retry: 2, // Retry up to 2 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  /**
   * Determines the best supported audio MIME type for the current browser.
   * Tries multiple formats in order of preference and falls back to browser-specific defaults.
   * 
   * @returns The best supported MIME type string
   */
  function getBestSupportedMimeType() {
    // Preferred audio formats in order of quality and compatibility
    const types = [
      'audio/webm', // Default WebM
      'audio/webm;codecs=opus', // WebM with Opus codec (high quality)
      'audio/mp4', // MP4 container
      'audio/ogg;codecs=opus', // OGG with Opus codec
      'audio/ogg', // Default OGG
      'audio/wav', // Uncompressed WAV (large files)
    ];

    // Check each type for MediaRecorder support
    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Browser-specific fallbacks when no types are explicitly supported
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
        return 'audio/mp4'; // Safari prefers MP4
      } else if (ua.indexOf('firefox') !== -1) {
        return 'audio/ogg'; // Firefox prefers OGG
      }
    }

    return 'audio/webm'; // Universal fallback
  }

  /**
   * Extracts the appropriate file extension from a MIME type.
   * Used for setting the correct filename when uploading audio.
   * 
   * @param mimeType - The MIME type string
   * @returns The corresponding file extension
   */
  const getFileExtension = (mimeType: string) => {
    if (mimeType.includes('mp4')) {
      return 'm4a'; // MP4 audio uses .m4a extension
    } else if (mimeType.includes('ogg')) {
      return 'ogg';
    } else if (mimeType.includes('wav')) {
      return 'wav';
    } else {
      return 'webm'; // Default for WebM and unknown types
    }
  };

  /**
   * Clean up MediaRecorder event listeners and reset the reference.
   * Prevents memory leaks and duplicate event handlers.
   */
  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.removeEventListener('dataavailable', (event: BlobEvent) => {
        audioChunks.push(event.data);
      });
      mediaRecorderRef.current.removeEventListener('stop', handleStop);
      mediaRecorderRef.current = null;
    }
  };

  /**
   * Request microphone permissions and initialize the audio stream.
   * Sets the permission state based on success/failure.
   * Handles various error types with specific messages.
   */
  const getMicrophonePermission = async () => {
    try {
      const streamData = await navigator.mediaDevices.getUserMedia({
        audio: true, // Request audio access
        video: false, // No video needed
      });
      setPermission(true);
      setPermissionError(null);
      audioStream.current = streamData ?? null;
    } catch (error: any) {
      // Handle different error types
      setPermission(false);
      
      if (error.name === 'NotAllowedError') {
        setPermissionError('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        setPermissionError('No microphone found. Please connect a microphone and try again.');
      } else if (error.name === 'NotReadableError') {
        setPermissionError('Microphone is already in use by another application.');
      } else {
        setPermissionError('Failed to access microphone: ' + error.message);
      }
      
      showToast({
        message: permissionError || 'Microphone access failed',
        status: 'error',
      });
    }
  };

  /**
   * Handle the stop event from MediaRecorder.
   * Creates audio blob, prepares form data, and sends to transcription service.
   */
  const handleStop = () => {
    if (audioChunks.length > 0) {
      // Create blob from recorded audio chunks
      const audioBlob = new Blob(audioChunks, { type: audioMimeType });
      const fileExtension = getFileExtension(audioMimeType);

      // Clear chunks for next recording
      setAudioChunks([]);

      // Prepare form data for API upload
      const formData = new FormData();
      formData.append('audio', audioBlob, `audio.${fileExtension}`);
      setIsRequestBeingMade(true);
      cleanup();
      processAudio(formData);
    } else {
      // No audio data recorded
      showToast({ message: 'The audio was too short', status: 'warning' });
    }
  };

  /**
   * Monitor audio levels to detect silence and automatically stop recording.
   * Uses Web Audio API to analyze frequency data in real-time.
   * Optimized to run at 10Hz instead of 60Hz for better performance.
   * 
   * @param stream - The MediaStream to monitor
   * @param stopRecording - Function to call when silence is detected
   */
  const monitorSilence = (stream: MediaStream, stopRecording: () => void) => {
    // Set up audio analysis pipeline
    const audioContext = new AudioContext();
    const audioStreamSource = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.minDecibels = minDecibels; // Set silence detection sensitivity
    audioStreamSource.connect(analyser);
    
    // Store audio context for cleanup
    audioContextRef.current = audioContext;

    // Prepare frequency analysis buffers
    const bufferLength = analyser.frequencyBinCount;
    const domainData = new Uint8Array(bufferLength);
    let lastSoundTime = Date.now();
    let intervalId: NodeJS.Timeout | null = null;

    /**
     * Check for sound/silence at 10Hz (100ms intervals) for better performance.
     * This reduces CPU usage while maintaining responsive silence detection.
     */
    const detectSound = () => {
      // Get current frequency data
      analyser.getByteFrequencyData(domainData);
      // Check if any frequency has energy above silence threshold
      const isSoundDetected = domainData.some((value) => value > 0);

      if (isSoundDetected) {
        // Reset silence timer when sound is detected
        lastSoundTime = Date.now();
      }

      // Calculate how long since last sound was detected
      const timeSinceLastSound = Date.now() - lastSoundTime;
      const isOverSilenceThreshold = timeSinceLastSound > silenceTimeoutMs;

      if (isOverSilenceThreshold) {
        // Silence timeout reached - stop recording
        if (intervalId) {
          clearInterval(intervalId);
        }
        stopRecording();
        return;
      }
    };

    // Start the monitoring loop at 10Hz (100ms intervals)
    intervalId = setInterval(detectSound, 100);
    
    // Store interval ID for cleanup
    animationFrameIdRef.current = intervalId as unknown as number;
  };

  /**
   * Start audio recording with MediaRecorder.
   * Handles permission checks, MediaRecorder setup, and silence monitoring.
   * Includes concurrent session protection.
   */
  const startRecording = async () => {
    // Prevent multiple simultaneous requests
    if (isRequestBeingMade) {
      showToast({ message: 'A request is already being made. Please wait.', status: 'warning' });
      return;
    }
    
    // Prevent concurrent recording sessions
    if (isListening) {
      showToast({ message: 'Recording is already in progress.', status: 'warning' });
      return;
    }

    // Ensure microphone permission is granted
    if (!audioStream.current) {
      await getMicrophonePermission();
    }

    if (audioStream.current) {
      try {
        // Verify stream is still active
        const tracks = audioStream.current.getTracks();
        if (!tracks.length || !tracks.every(track => track.readyState === 'live')) {
          // Stream is not active, request permission again
          audioStream.current = null;
          await getMicrophonePermission();
          if (!audioStream.current) {
            return;
          }
        }
        
        // Reset audio chunks for new recording
        setAudioChunks([]);
        const bestMimeType = getBestSupportedMimeType();
        setAudioMimeType(bestMimeType);

        // Initialize MediaRecorder with optimal settings
        mediaRecorderRef.current = new MediaRecorder(audioStream.current, {
          mimeType: audioMimeType,
        });
        
        // Set up event listeners for data collection and stop handling
        mediaRecorderRef.current.addEventListener('dataavailable', (event: BlobEvent) => {
          audioChunks.push(event.data);
        });
        mediaRecorderRef.current.addEventListener('stop', handleStop);
        
        // Start recording with 100ms timeslices for responsive data handling
        mediaRecorderRef.current.start(100);
        
        // Enable silence monitoring if auto-transcribe is enabled
        if (!audioContextRef.current && autoTranscribeAudio && speechToText) {
          monitorSilence(audioStream.current, stopRecording);
        }
        
        setIsListening(true);
      } catch (error) {
        showToast({ message: `Error starting recording: ${error}`, status: 'error' });
      }
    } else {
      showToast({ message: 'Microphone permission not granted', status: 'error' });
    }
  };

  /**
   * Stop audio recording and clean up resources.
   * Handles MediaRecorder state, stream cleanup, and silence monitoring cleanup.
   * Optimized to preserve stream for reuse when possible.
   */
  const stopRecording = () => {
    if (!mediaRecorderRef.current) {
      return;
    }

    // Only stop if currently recording
    if (mediaRecorderRef.current.state === 'recording') {
      // Stop the MediaRecorder (triggers 'stop' event and handleStop)
      mediaRecorderRef.current.stop();

      // Don't stop tracks here - preserve stream for reuse
      // Tracks will be stopped when component unmounts or permission is revoked

      // Cancel silence monitoring interval
      if (animationFrameIdRef.current !== null) {
        clearInterval(animationFrameIdRef.current as unknown as NodeJS.Timeout);
        animationFrameIdRef.current = null;
      }
      
      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      setIsListening(false);
    } else {
      showToast({ message: 'MediaRecorder is not recording', status: 'error' });
    }
  };

  /**
   * External interface for starting recording with validation.
   * Prevents starting when already recording.
   */
  const externalStartRecording = () => {
    if (isListening) {
      showToast({ message: 'Already listening. Please stop recording first.', status: 'warning' });
      return;
    }

    startRecording();
  };

  /**
   * Clear all accumulated text and reset the input field.
   * Used for manual text clearing.
   */
  const clearAccumulatedText = () => {
    accumulatedText.current = '';
    setText('');
  };

  /**
   * External interface for stopping recording with validation.
   * Prevents stopping when not currently recording.
   */
  const externalStopRecording = () => {
    if (!isListening) {
      showToast({
        message: 'Not currently recording. Please start recording first.',
        status: 'warning',
      });
      return;
    }

    stopRecording();
  };

  /**
   * Handle keyboard shortcuts for recording control.
   * Shortcut: Shift + Alt + L (only when external STT is enabled)
   */
  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.shiftKey && e.altKey && e.code === 'KeyL' && isExternalSTTEnabled) {
      // Check browser support for MediaRecorder
      if (!window.MediaRecorder) {
        showToast({ message: 'MediaRecorder is not supported in this browser', status: 'error' });
        return;
      }

      // Request permission if not already granted
      if (permission === false) {
        await getMicrophonePermission();
      }

      // Toggle recording state
      if (isListening) {
        stopRecording();
      } else {
        startRecording();
      }

      e.preventDefault();
    }
  };

  /**
   * Set up keyboard event listener for recording shortcuts.
   * Re-registers when listening state changes to capture current state.
   */
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);
  
  /**
   * Clean up audio resources on component unmount.
   */
  useEffect(() => {
    return () => {
      // Clean up on unmount
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => track.stop());
        audioStream.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (animationFrameIdRef.current) {
        clearInterval(animationFrameIdRef.current as unknown as NodeJS.Timeout);
        animationFrameIdRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    externalStopRecording,
    externalStartRecording,
    isLoading: isProcessing,
    clearAccumulatedText,
  };
};

export default useSpeechToTextExternal;
