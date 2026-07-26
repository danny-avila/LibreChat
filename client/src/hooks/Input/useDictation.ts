import { useRef, useState, useEffect, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import type { TAskFunction } from '~/common';
import useAudioLevels from '~/hooks/Input/useAudioLevels';
import useGetAudioSettings from './useGetAudioSettings';
import { useChatFormContext } from '~/Providers';
import useSpeechToText from './useSpeechToText';
import { globalAudioId } from '~/common';
import useLocalize from '../useLocalize';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';

/** How the in-flight transcription should be spent once recording ends. */
type StopMode = 'compose' | 'send' | 'cancel';

export interface Dictation {
  active: boolean;
  transcribing: boolean;
  levels: number[];
  elapsed: number;
  start: () => void;
  /** Drop the take and restore whatever draft was there before. */
  cancel: () => void;
  /** Transcribe into the composer and stop, leaving the turn unsent. */
  stopToComposer: () => void;
  /** Transcribe and send in one action. */
  stopAndSend: () => void;
}

/**
 * Speech capture for the composer, owning the whole recording lifecycle so the
 * bar can hand its existing buttons over to it: `+` becomes cancel, the mic
 * becomes stop, and send transcribes and sends in one action.
 *
 * Stopping and sending are deliberately separate. Previously the only control
 * submitted whatever had been heard, with no way to review it first and no way
 * to back out at all.
 */
export default function useDictation({
  ask,
  methods,
  isSubmitting,
}: {
  ask: TAskFunction;
  methods: ReturnType<typeof useChatFormContext>;
  isSubmitting: boolean;
}): Dictation {
  const { setValue, reset, getValues } = methods;
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { speechToTextEndpoint } = useGetAudioSettings();

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  /** Read when the transcription lands, which is after the stop that set it.
   *  The speech hooks have no notion of cancelling or of deferring a send. */
  const modeRef = useRef<StopMode>('compose');

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      const mode = modeRef.current;
      modeRef.current = 'compose';

      if (mode === 'cancel') {
        reset({ text: existingTextRef.current });
        existingTextRef.current = '';
        return;
      }

      /** For external STT, append existing text to the transcription */
      const finalText =
        isExternalSTT(speechToTextEndpoint) && existingTextRef.current
          ? `${existingTextRef.current} ${text}`
          : text;

      if (mode === 'compose') {
        if (finalText) {
          setValue('text', finalText, { shouldValidate: true });
        }
        existingTextRef.current = '';
        return;
      }

      if (isSubmittingRef.current) {
        showToast({ message: localize('com_ui_speech_while_submitting'), status: 'error' });
        return;
      }
      if (!finalText) {
        return;
      }
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
      if (globalAudio) {
        globalAudio.muted = false;
      }
      const submitted = ask({ text: finalText });
      if (submitted === false) {
        return;
      }
      reset({ text: '' });
      existingTextRef.current = '';
    },
    [ask, reset, setValue, showToast, localize, speechToTextEndpoint],
  );

  const setText = useCallback(
    (text: string) => {
      if (modeRef.current === 'cancel') {
        return;
      }
      setValue('text', existingTextRef.current ? `${existingTextRef.current} ${text}` : text, {
        shouldValidate: true,
      });
    },
    [setValue],
  );

  const { isListening, isLoading, startRecording, stopRecording, abortRecording } = useSpeechToText(
    setText,
    onTranscriptionComplete,
  );

  const active = isListening === true;
  const levels = useAudioLevels(active);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const start = useCallback(() => {
    modeRef.current = 'compose';
    existingTextRef.current = getValues('text') || '';
    startRecording();
  }, [getValues, startRecording]);

  const stopWith = useCallback(
    (mode: StopMode) => {
      modeRef.current = mode;
      stopRecording();
    },
    [stopRecording],
  );

  /* A real abort, not a stop that throws the result away: stopping would still
     hand the audio to the transcription request and flash "Transcribing" before
     discarding it. The mode flag stays set as a backstop in case a transcript
     that was already in flight lands anyway. */
  const cancel = useCallback(() => {
    modeRef.current = 'cancel';
    abortRecording();
    reset({ text: existingTextRef.current });
    existingTextRef.current = '';
  }, [abortRecording, reset]);

  return {
    active,
    transcribing: isLoading === true,
    levels,
    elapsed,
    start,
    cancel,
    stopToComposer: useCallback(() => stopWith('compose'), [stopWith]),
    stopAndSend: useCallback(() => stopWith('send'), [stopWith]),
  };
}
