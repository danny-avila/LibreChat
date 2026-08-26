import { useMemo, useSyncExternalStore } from 'react';
import { useRecoilValue } from 'recoil';
import type { VoiceOption } from '~/common';
import { subscribeSpeechVoices, getSpeechVoicesSnapshot } from '~/utils';
import store from '~/store';

function useTextToSpeechBrowser({
  setIsSpeaking,
}: {
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const voiceName = useRecoilValue(store.voice);
  const cloudBrowserVoices = useRecoilValue(store.cloudBrowserVoices);
  const { voices: availableVoices, supported: isSpeechSynthesisSupported } = useSyncExternalStore(
    subscribeSpeechVoices,
    getSpeechVoicesSnapshot,
    getSpeechVoicesSnapshot,
  );

  const voices = useMemo(() => {
    const filteredVoices = availableVoices.filter(
      (v) => cloudBrowserVoices || v.localService === true,
    );
    return filteredVoices.map((v): VoiceOption => ({ value: v.name, label: v.name }));
  }, [availableVoices, cloudBrowserVoices]);

  const generateSpeechLocal = (text: string) => {
    if (!isSpeechSynthesisSupported) {
      console.warn('Speech synthesis is not supported');
      return;
    }

    const synth = window.speechSynthesis;
    const voice = voices.find((v) => v.value === voiceName);

    if (!voice) {
      console.warn('Selected voice not found');
      return;
    }

    try {
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = synth.getVoices().find((v) => v.name === voice.value) || null;
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') {
          setIsSpeaking(false);
          return;
        }

        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
      };
      setIsSpeaking(true);
      synth.speak(utterance);
    } catch (error) {
      console.error('Error generating speech:', error);
      setIsSpeaking(false);
    }
  };

  const cancelSpeechLocal = () => {
    if (!isSpeechSynthesisSupported) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      console.error('Error cancelling speech:', error);
    } finally {
      setIsSpeaking(false);
    }
  };

  return { generateSpeechLocal, cancelSpeechLocal, voices, isSpeechSynthesisSupported };
}

export default useTextToSpeechBrowser;
