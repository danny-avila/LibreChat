import React from 'react';
import useAudioRecorder from '~/hooks/useAudioRecorder';
import { MicrophoneIcon, StopRecordingIcon } from '~/components/svg';

const AudioRecorderButton = ({ onTranscription, index }) => {
  const { isFetching, isRecording, handleRecording } = useAudioRecorder(onTranscription, index);

  return (
    <button
      className="absolute bottom-1.5 right-12 rounded-lg border border-black p-1 text-white transition-colors enabled:bg-black disabled:bg-black disabled:text-gray-400 disabled:opacity-10 dark:border-white dark:bg-white dark:hover:bg-gray-900 dark:disabled:bg-white dark:disabled:hover:bg-transparent md:bottom-3 md:right-14"
      onClick={handleRecording}
    >
      {!isFetching ? (
        isRecording ? (
          <StopRecordingIcon size={23} />
        ) : (
          <MicrophoneIcon size={23} />
        )
      ) : null}
    </button>
  );
};

export default AudioRecorderButton;
