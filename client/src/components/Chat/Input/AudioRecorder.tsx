import React from 'react';
import { ListeningIcon, Spinner, SpeechIcon } from '~/components/svg';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';
import { useLocalize } from '~/hooks';

export default function AudioRecorder({
  isListening,
  isLoading,
  startRecording,
  stopRecording,
  disabled,
}) {
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
            onClick={isListening ? handleStopRecording : handleStartRecording}
            disabled={disabled}
            className="absolute bottom-1.5 right-12 flex h-[30px] w-[30px] items-center justify-center rounded-lg p-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 md:bottom-3 md:right-12"
            type="button"
          >
            {isListening ? (
              <SpeechIcon className="stroke-gray-700 dark:stroke-gray-300" />
            ) : isLoading ? (
              <Spinner className="stroke-gray-700 dark:stroke-gray-300" />
            ) : (
              <ListeningIcon className="stroke-gray-700 dark:stroke-gray-300" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {localize('com_ui_use_micrphone')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
