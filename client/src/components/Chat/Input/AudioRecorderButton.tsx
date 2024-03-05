import React from 'react';
import useAudioRecorder from '~/hooks/useAudioRecorder';
import { MicrophoneIcon, StopRecordingIcon } from '~/components/svg';

const AudioRecorderButton = ({ onTranscription, index }) => {
  const { isRecording, handleRecording } = useAudioRecorder(onTranscription, index);

  return (
    <button
      className="absolute bottom-1.5 right-2 rounded-lg border border-black p-0.5 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:hover:bg-gray-900 dark:disabled:bg-white dark:disabled:hover:bg-transparent md:bottom-3 md:right-3"
      onClick={handleRecording}
    >
      {isRecording ? <StopRecordingIcon size={24} /> : <MicrophoneIcon size={24} />}
    </button>
  );
};

export default AudioRecorderButton;
