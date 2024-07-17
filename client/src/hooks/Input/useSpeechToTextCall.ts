import { useState, useEffect, useCallback } from 'react';
import useSpeechToTextBrowser from './useSpeechToTextBrowser';
import useSpeechToTextExternal from './useSpeechToTextExternal';
import useGetAudioSettings from './useGetAudioSettings';

const useSpeechToText = (handleTranscriptionComplete: (text: string) => void) => {
  const { externalSpeechToText } = useGetAudioSettings();
  const [animatedText, setAnimatedText] = useState('');
  const [rmsLevel, setRmsLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const {
    isListening: speechIsListeningBrowser,
    isLoading: speechIsLoadingBrowser,
    interimTranscript: interimTranscriptBrowser,
    text: speechTextBrowser,
    startRecording: startSpeechRecordingBrowser,
    stopRecording: stopSpeechRecordingBrowser,
  } = useSpeechToTextBrowser();

  const {
    isListening: speechIsListeningExternal,
    isLoading: speechIsLoadingExternal,
    text: speechTextExternal,
    externalStartRecording: startSpeechRecordingExternal,
    externalStopRecording: stopSpeechRecordingExternal,
    clearText,
    isAudioDetected,
  } = useSpeechToTextExternal(handleTranscriptionComplete);

  const isListening = externalSpeechToText ? speechIsListeningExternal : speechIsListeningBrowser;
  const isLoading = externalSpeechToText ? speechIsLoadingExternal : speechIsLoadingBrowser;
  const speechTextForm = externalSpeechToText ? speechTextExternal : speechTextBrowser;
  const startRecording = externalSpeechToText
    ? startSpeechRecordingExternal
    : startSpeechRecordingBrowser;
  const stopRecording = externalSpeechToText
    ? stopSpeechRecordingExternal
    : stopSpeechRecordingBrowser;
  const speechText =
    isListening || (speechTextExternal && speechTextExternal.length > 0)
      ? speechTextExternal
      : speechTextForm || '';
  // for a future real-time STT external
  const interimTranscript = externalSpeechToText ? '' : interimTranscriptBrowser;

  const calculateRMS = (data: Uint8Array) => {
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const normalizedValue = (data[i] - 128) / 128;
      sumSquares += normalizedValue * normalizedValue;
    }
    return Math.sqrt(sumSquares / data.length);
  };

  const processAudio = useCallback(
    (stream) => {
      const audioContext = new AudioContext();
      const audioStreamSource = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      audioStreamSource.connect(analyser);

      let silenceTimeout;

      const processFrame = () => {
        const timeDomainData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeDomainData);
        const rms = calculateRMS(timeDomainData);
        setRmsLevel(rms);
        setIsSpeaking(rms > 0);

        clearTimeout(silenceTimeout);
        if (rms > 0.05) {
          silenceTimeout = setTimeout(() => setIsSpeaking(false), 500); // Silence threshold of 0.5 seconds
        }

        if (isListening) {
          requestAnimationFrame(processFrame);
        } else {
          audioContext.close();
        }
      };

      requestAnimationFrame(processFrame);
    },
    [isAudioDetected],
  );

  useEffect(() => {
    let stream;
    if (isListening) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
        stream = s;
        processAudio(s);
      });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isAudioDetected, processAudio]);

  const animateTextTyping = (text: string) => {
    const totalDuration = 2000;
    const frameRate = 60;
    const totalFrames = totalDuration / (1000 / frameRate);
    const charsPerFrame = Math.ceil(text.length / totalFrames);
    let currentIndex = 0;

    const animate = () => {
      currentIndex += charsPerFrame;
      const currentText = text.substring(0, currentIndex);
      setAnimatedText(currentText);

      if (currentIndex < text.length) {
        requestAnimationFrame(animate);
      } else {
        setAnimatedText(text);
      }
    };

    requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (speechText && externalSpeechToText) {
      animateTextTyping(speechText);
    }
  }, [speechText, externalSpeechToText]);

  return {
    isListening,
    isLoading,
    startRecording,
    stopRecording,
    interimTranscript,
    speechText: externalSpeechToText ? animatedText : speechText,
    clearText,
    rmsLevel,
    isSpeaking,
    isAudioDetected,
  };
};

export default useSpeechToText;
