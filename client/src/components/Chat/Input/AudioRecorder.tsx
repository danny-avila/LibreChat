import { useCallback } from 'react';
import { useChatFormContext, useToastContext } from '~/Providers';
import { ListeningIcon, Spinner } from '~/components/svg';
import { useLocalize, useSpeechToText } from '~/hooks';
import { TooltipAnchor } from '~/components/ui';
import { globalAudioId } from '~/common';
import { cn } from '~/utils';

export default function AudioRecorder({
  isRTL,
  disabled,
  ask,
  methods,
  textAreaRef,
  isSubmitting,
}: {
  isRTL: boolean;
  disabled: boolean;
  ask: (data: { text: string }) => void;
  methods: ReturnType<typeof useChatFormContext>;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  isSubmitting: boolean;
}) {
  const { setValue, reset } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isSubmitting) {
        showToast({
          message: localize('com_ui_speech_while_submitting'),
          status: 'error',
        });
        return;
      }
      if (text) {
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        ask({ text });
        reset({ text: '' });
      }
    },
    [ask, reset, showToast, localize, isSubmitting],
  );

  const setText = useCallback(
    (text: string) => {
      setValue('text', text, {
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const { isListening, isLoading, startRecording, stopRecording } = useSpeechToText(
    setText,
    onTranscriptionComplete,
  );

  if (!textAreaRef.current) {
    return null;
  }

  const handleStartRecording = async () => startRecording();

  const handleStopRecording = async () => stopRecording();

  const renderIcon = () => {
    if (isListening === true) {
      return <ListeningIcon className="stroke-red-500" />;
    }
    if (isLoading === true) {
      return <Spinner className="stroke-gray-700 dark:stroke-gray-300" />;
    }
    return <ListeningIcon className="stroke-gray-700 dark:stroke-gray-300" />;
  };

  return (
    <TooltipAnchor
      id="audio-recorder"
      aria-label={localize('com_ui_use_micrphone')}
      onClick={isListening === true ? handleStopRecording : handleStartRecording}
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
