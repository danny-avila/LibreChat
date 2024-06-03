import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';
import { ListeningIcon, Spinner } from '~/components/svg';
import { useLocalize, useSpeechToText } from '~/hooks';
import { globalAudioId } from '~/common';

export default function AudioRecorder({
  textAreaRef,
  methods,
  ask,
  disabled,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  methods: UseFormReturn<{ text: string }>;
  ask: (data: { text: string }) => void;
  disabled: boolean;
}) {
  const localize = useLocalize();

  const handleTranscriptionComplete = (text: string) => {
    if (text) {
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement;
      if (globalAudio) {
        console.log('Unmuting global audio');
        globalAudio.muted = false;
      }
      ask({ text });
      methods.reset({ text: '' });
      clearText();
    }
  };

  const { isListening, isLoading, startRecording, stopRecording, speechText, clearText } =
    useSpeechToText(handleTranscriptionComplete);

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.value = speechText;
      methods.setValue('text', speechText, { shouldValidate: true });
    }
  }, [speechText, methods, textAreaRef]);

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    await stopRecording();
  };

  const renderIcon = () => {
    if (isListening) {
      return <ListeningIcon className="stroke-red-500" />;
    }
    if (isLoading) {
      return <Spinner className="stroke-gray-700 dark:stroke-gray-300" />;
    }
    return <ListeningIcon className="stroke-gray-700 dark:stroke-gray-300" />;
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
            {renderIcon()}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {localize('com_ui_use_micrphone')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
