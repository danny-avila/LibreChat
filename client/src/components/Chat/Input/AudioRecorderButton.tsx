import React, { useContext, useEffect } from 'react';
import useAudioRecorder from '~/hooks/useAudioRecorder';
import { MicrophoneIcon, StopRecordingIcon, Spinner } from '~/components/svg';
import { ThemeContext } from '~/hooks/ThemeContext';

const AudioRecorderButton = ({ onTranscription, index, onRecordingChange, onFetchingChange }) => {
  const { theme } = useContext(ThemeContext);
  const { isFetching, isRecording, handleRecording } = useAudioRecorder(onTranscription, index);
  let isDarkMode = theme === 'dark';
  if (theme === 'system') {
    isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  let icon: React.JSX.Element | null;
  if (!isFetching) {
    icon = isRecording ? <StopRecordingIcon size={21} /> : <MicrophoneIcon size={22} />;
  } else {
    icon = <Spinner className="h-6 w-6 cursor-default text-black dark:text-white" />;
  }

  useEffect(() => {
    console.log('isFetching AudioRecorderButton:', isFetching);
    onFetchingChange(isFetching);
  }, [isFetching, onFetchingChange]);

  useEffect(() => {
    onRecordingChange(isRecording);
  }, [isRecording, onRecordingChange]);

  return (
    <button
      style={
        isFetching
          ? { backgroundColor: 'transparent', borderColor: 'transparent', cursor: 'default' }
          : isRecording
            ? {
              backgroundColor: isDarkMode ? 'transparent' : 'white',
              borderColor: isDarkMode ? 'white' : 'black',
              borderWidth: '2px',
            }
            : { borderWidth: '1px' }
      }
      className="absolute bottom-1.5 right-12 rounded-lg border-black p-1 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:hover:bg-gray-900 dark:disabled:bg-white dark:disabled:hover:bg-transparent md:bottom-2.5 md:right-14"
      onClick={handleRecording}
    >
      {icon}
    </button>
  );
};

export default AudioRecorderButton;
