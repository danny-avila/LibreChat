import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import type { TAskFunction } from '~/common';
import useGetAudioSettings from './useGetAudioSettings';
import { useChatFormContext } from '~/Providers';
import useSpeechToText from './useSpeechToText';
import { globalAudioId } from '~/common';
import useLocalize from '../useLocalize';
import store from '~/store';

const isExternalSTT = (speechToTextEndpoint: string) => speechToTextEndpoint === 'external';

/** How long to hold the recording layout after a stop before giving up on a
 *  transcription request ever being reported. */
const SETTLE_MS = 500;

/** How the in-flight transcription should be spent once recording ends. */
type StopMode = 'compose' | 'send' | 'cancel';

export interface Dictation {
  active: boolean;
  transcribing: boolean;
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
  const autoSendText = useRecoilValue(store.autoSendText);
  /** The Auto Send Text setting, which submits a plain recording once its
   *  transcript settles. A stop that was never asked to send still honours it. */
  const autoSendEnabled = autoSendText > -1;

  const existingTextRef = useRef<string>('');
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  /** Read when the transcription lands, which is after the stop that set it.
   *  The speech hooks have no notion of cancelling or of deferring a send. */
  const modeRef = useRef<StopMode>('compose');
  /** One submission per take. Both the settle fallback below and a late
   *  auto-send callback can reach the same transcript, and whichever gets
   *  there first is the one that spends it. */
  const spentRef = useRef(false);

  const submit = useCallback(
    (text: string) => {
      if (spentRef.current) {
        return;
      }
      if (isSubmittingRef.current) {
        showToast({ message: localize('com_ui_speech_while_submitting'), status: 'error' });
        return;
      }
      if (!text) {
        return;
      }
      spentRef.current = true;
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | null;
      if (globalAudio) {
        globalAudio.muted = false;
      }
      const submitted = ask({ text });
      if (submitted === false) {
        spentRef.current = false;
        return;
      }
      reset({ text: '' });
      existingTextRef.current = '';
    },
    [ask, reset, showToast, localize],
  );

  const onTranscriptionComplete = useCallback(
    (text: string) => {
      const mode = modeRef.current;

      if (mode === 'cancel') {
        /* The draft stays on the ref until a take is actually spent: an
           external transcription already in flight cannot be recalled, and
           clearing it at cancel time left this reset wiping the very draft the
           cancel had just put back. */
        reset({ text: existingTextRef.current });
        return;
      }

      /** For external STT, append existing text to the transcription */
      const finalText =
        isExternalSTT(speechToTextEndpoint) && existingTextRef.current
          ? `${existingTextRef.current} ${text}`
          : text;

      if (mode === 'compose' && !autoSendEnabled) {
        if (finalText) {
          setValue('text', finalText, { shouldValidate: true });
        }
        existingTextRef.current = '';
        return;
      }

      submit(finalText);
    },
    [reset, setValue, submit, autoSendEnabled, speechToTextEndpoint],
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

  /* Bridges the gap between the recorder being told to stop and the upload
     starting: `isListening` clears synchronously, while the recorder's own
     `stop` event, which is what begins the transcription request, arrives a
     tick later. Without this the composer reads as idle for that tick and every
     control it had put away flashes back in and out again. */
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (!settling) {
      return;
    }
    if (isLoading === true) {
      setSettling(false);
      return;
    }
    /* Backstop for the engines that never report a request at all: the browser
       recogniser hands its transcript straight over, so nothing else would ever
       clear this. */
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling, isLoading]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);

  /* The engines only report a completed transcription when Auto Send Text is
     configured, so an explicit stop-and-send cannot wait for that callback:
     with the default setting it never arrives. Instead the send is armed here
     and spent once the take has fully settled, reading whatever the transcript
     put in the composer. */
  const [pendingSend, setPendingSend] = useState(false);
  useEffect(() => {
    if (!pendingSend || active || isLoading === true || settling) {
      return;
    }
    setPendingSend(false);
    submit(getValues('text') || '');
  }, [pendingSend, active, isLoading, settling, submit, getValues]);

  const start = useCallback(() => {
    modeRef.current = 'compose';
    spentRef.current = false;
    setPendingSend(false);
    existingTextRef.current = getValues('text') || '';
    startRecording();
  }, [getValues, startRecording]);

  const stopWith = useCallback(
    (mode: StopMode) => {
      modeRef.current = mode;
      setSettling(true);
      if (mode === 'send') {
        setPendingSend(true);
      }
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
    spentRef.current = true;
    setSettling(false);
    setPendingSend(false);
    abortRecording();
    reset({ text: existingTextRef.current });
  }, [abortRecording, reset]);

  const stopToComposer = useCallback(() => stopWith('compose'), [stopWith]);
  const stopAndSend = useCallback(() => stopWith('send'), [stopWith]);

  /* Memoized so `memo(Bar)` has something that can compare equal: a fresh
     object here re-rendered the whole bar on every keystroke in the composer. */
  return useMemo(
    () => ({
      active,
      transcribing: isLoading === true || settling,
      elapsed,
      start,
      cancel,
      stopToComposer,
      stopAndSend,
    }),
    [active, isLoading, settling, elapsed, start, cancel, stopToComposer, stopAndSend],
  );
}
