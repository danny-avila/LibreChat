import React from 'react';
import { ListeningIcon, Spinner, SpeechIcon } from '~/components/svg';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';
import { useLocalize } from '~/hooks';

export default function AudioRecorder({ isListening, isLoading, startRecording, stopRecording }) {
  const localize = useLocalize();

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
            className="absolute bottom-1.5 right-12 flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-black bg-black p-0.5 transition-colors dark:border-white dark:bg-white md:bottom-3 md:right-12"
            onClick={isListening ? handleStopRecording : handleStartRecording}
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
          TTS
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
