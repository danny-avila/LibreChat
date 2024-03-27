import React from 'react';
import { ListeningIcon, Spinner, SpeechIcon } from '~/components/svg';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';

export default function AudioRecorder({
  isListening,
  isLoading,
  startRecording,
  stopRecording,
  disabled,
}) {
  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    await stopRecording();
  };

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={isListening ? handleStopRecording : handleStartRecording}
            disabled={disabled}
            className="absolute bottom-1.5 right-12 flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-black p-0.5 transition-colors disabled:disabled:opacity-10 dark:bg-white dark:disabled:opacity-10 md:bottom-3 md:right-12"
          >
            {isListening ? (
              <SpeechIcon className="stroke-white dark:stroke-black" />
            ) : isLoading ? (
              <Spinner className="stroke-white dark:stroke-black" />
            ) : (
              <ListeningIcon className="stroke-white dark:stroke-black" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          Use microphone
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
