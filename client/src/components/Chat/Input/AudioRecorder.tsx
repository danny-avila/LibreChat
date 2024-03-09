import React from 'react';
import { ListeningIcon, Spinner, AudioLinesIcon } from '~/components/svg';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';
import { useLocalize } from '~/hooks';

export default function AudioRecorder({ isListening, isLoading, startRecording, stopRecording }) {
  const localize = useLocalize();

  if (isListening) {
    console.log('Speech recognition is active');
  } else {
    console.log('Speech recognition is not active');
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          {isListening ? (
            <button
              className="absolute bottom-1.5 right-12 rounded-lg border border-black bg-black p-0.5 transition-colors dark:border-white dark:bg-white md:bottom-3 md:right-12"
              onClick={stopRecording}
            >
              <span className="" data-state="closed">
                <AudioLinesIcon className="icon-sm m-auto text-white" />
              </span>
            </button>
          ) : isLoading ? (
            <button className="absolute bottom-1.5 right-12 rounded-lg border border-black bg-black p-0.5 transition-colors dark:border-white dark:bg-white md:bottom-3 md:right-12">
              <span className="" data-state="closed">
                <Spinner className="icon-sm m-auto text-white" />
              </span>
            </button>
          ) : (
            <button
              className="absolute bottom-1.5 right-12 rounded-lg border border-black bg-black p-0.5 transition-colors dark:border-white dark:bg-white md:bottom-3 md:right-12"
              onClick={startRecording}
            >
              <span className="" data-state="closed">
                <ListeningIcon className="stroke-white dark:stroke-black" />
              </span>
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          STT
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
