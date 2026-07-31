import { memo, useCallback, useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useToastContext, TooltipAnchor, ListeningIcon, Spinner } from '@librechat/client';
import { useLocalize, useSpeechToText, useGetAudioSettings } from '~/hooks';
import { globalAudioId, type TAskFunction } from '~/common';
import { useChatFormContext } from '~/Providers';
import { cn } from '~/utils';
import store from '~/store';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';

/** Pause between the assistant finishing and the microphone re-arming in
 * conversation mode. Long enough for playback to settle and for the user to
 * register that it is their turn; short enough not to feel broken. */
const REARM_DELAY_MS = 2000;
export default memo(function AudioRecorder({
  disabled,
  ask,
  methods,
  isSubmitting,
  index = 0,
}: {
  disabled: boolean;
  ask: TAskFunction;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
  index?: number;
}) {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  /** Conversation mode: re-arm the microphone once the assistant stops speaking.
   *
   * Only when the turn was started by voice - typing a message and then
   * listening to the reply should not silently switch the microphone on. */
  const conversationMode = useRecoilValue(store.conversationMode);
  const isPlaying = useRecoilValue(store.globalAudioPlayingFamily(index));
  const textToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const voiceTurnRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const wasSubmittingRef = useRef(false);

  /** Whether the assistant is going to speak this reply. Determines WHICH
   * event ends the assistant's turn: playback finishing, or generation
   * finishing. Without automatic playback there is no audio to wait for, so
   * waiting for it would mean never re-arming at all. */
  const willSpeak = textToSpeech && automaticPlayback;

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      if (isSubmittingRef.current) {
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
        /** For external STT, append existing text to the transcription */
        const finalText =
          isExternalSTT(speechToTextEndpoint) && existingTextRef.current
            ? `${existingTextRef.current} ${text}`
            : text;
        const submitted = ask({ text: finalText });
        if (submitted === false) {
          return;
        }
        /** This turn began with speech, so conversation mode may re-arm the
         * microphone when the reply finishes playing. */
        voiceTurnRef.current = true;
        reset({ text: '' });
        existingTextRef.current = '';
      }
    },
    [ask, reset, showToast, localize, speechToTextEndpoint],
  );

  const setText = useCallback(
    (text: string) => {
      let newText = text;
      if (isExternalSTT(speechToTextEndpoint)) {
        /** For external STT, the text comes as a complete transcription, so append to existing */
        newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      } else {
        /** For browser STT, the transcript is cumulative, so we only need to prepend the existing text once */
        newText = existingTextRef.current ? `${existingTextRef.current} ${text}` : text;
      }
      setValue('text', newText, {
        shouldValidate: true,
      });
    },
    [setValue, speechToTextEndpoint],
  );

  const { isListening, isLoading, startRecording, stopRecording } = useSpeechToText(
    setText,
    onTranscriptionComplete,
  );

  /** Re-arm the microphone when the assistant finishes speaking.
   *
   * Gated on all three of:
   *   - the Conversation mode toggle being on (Settings -> Speech)
   *   - the turn having been started by voice, not typed
   *   - playback having actually transitioned from playing to stopped
   *
   * The transition matters: this atom is false before playback begins as well
   * as after it ends, so acting on the value alone would start recording the
   * moment the component mounts. */
  useEffect(() => {
    const stoppedPlaying = wasPlayingRef.current && !isPlaying;
    const stoppedGenerating = wasSubmittingRef.current && !isSubmitting;
    wasPlayingRef.current = isPlaying;
    wasSubmittingRef.current = isSubmitting;

    /** The assistant's turn ends when it stops SPEAKING if it speaks, and when
     * it stops WRITING if it does not. Supporting only the first means voice
     * input with a text-only reply never re-arms - a perfectly reasonable way
     * to use this, and quieter than being spoken to. */
    const turnEnded = willSpeak ? stoppedPlaying : stoppedGenerating;

    if (!conversationMode || !turnEnded) {
      return;
    }
    if (!voiceTurnRef.current) {
      return;
    }
    voiceTurnRef.current = false;

    /** Wait before listening again. After speech this stops the microphone
     * catching the tail of the assistant's own audio and the room's reverb,
     * which gets transcribed as something the user never said. After a written
     * reply there is no audio to avoid, but the pause still gives the user a
     * moment to read before being listened to. */
    const timer = setTimeout(() => {
      if (disabled || isSubmittingRef.current || isListening === true) {
        return;
      }
      existingTextRef.current = getValues('text') || '';
      startRecording();
    }, REARM_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    isPlaying,
    isSubmitting,
    willSpeak,
    conversationMode,
    disabled,
    isListening,
    startRecording,
    getValues,
  ]);

  const handleStartRecording = async () => {
    existingTextRef.current = getValues('text') || '';
    startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
    /** For browser STT, clear the reference since text was already being updated */
    if (!isExternalSTT(speechToTextEndpoint)) {
      existingTextRef.current = '';
    }
  };

  const renderIcon = () => {
    if (isListening === true) {
      return <MicOff className="stroke-red-500" />;
    }
    if (isLoading === true) {
      return <Spinner className="stroke-text-secondary" />;
    }
    return <ListeningIcon className="stroke-text-secondary" />;
  };

  return (
    <TooltipAnchor
      description={localize('com_ui_use_micrphone')}
      render={
        <button
          id="audio-recorder"
          type="button"
          aria-label={localize('com_ui_use_micrphone')}
          onClick={isListening === true ? handleStopRecording : handleStartRecording}
          disabled={disabled}
          className={cn(
            'flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover',
          )}
          title={localize('com_ui_use_micrphone')}
          aria-pressed={isListening}
        >
          {renderIcon()}
        </button>
      }
    />
  );
});
