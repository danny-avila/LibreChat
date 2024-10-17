import { useEffect } from 'react';
import { ListeningIcon, Spinner } from '~/components/svg';
import { useLocalize, useSpeechToText } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { TooltipAnchor } from '~/components/ui';
import { globalAudioId } from '~/common';
import { cn } from '~/utils';

export default function AudioRecorder({
  textAreaRef,
  methods,
  ask,
  isRTL,
  disabled,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  methods: ReturnType<typeof useChatFormContext>;
  ask: (data: { text: string }) => void;
  isRTL: boolean;
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

  const {
    isListening,
    isLoading,
    startRecording,
    stopRecording,
    interimTranscript,
    speechText,
    clearText,
  } = useSpeechToText(handleTranscriptionComplete);

  useEffect(() => {
    if (isListening && textAreaRef.current) {
      methods.setValue('text', interimTranscript, {
        shouldValidate: true,
      });
    } else if (textAreaRef.current) {
      textAreaRef.current.value = speechText;
      methods.setValue('text', speechText, { shouldValidate: true });
    }
  }, [interimTranscript, speechText, methods, textAreaRef]);

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
    <TooltipAnchor
      id="audio-recorder"
      aria-label={localize('com_ui_use_micrphone')}
      onClick={isListening ? handleStopRecording : handleStartRecording}
      disabled={disabled}
      className={cn(
        'absolute flex size-[35px] items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
        isRTL ? 'bottom-2 left-2' : 'bottom-2 right-2',
      )}
      description={localize('com_ui_use_micrphone')}
    >
      {renderIcon()}
    </TooltipAnchor>
  );
}
