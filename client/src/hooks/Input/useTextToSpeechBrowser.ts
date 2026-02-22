import { useRecoilValue } from 'recoil';
import { useState, useEffect, useCallback } from 'react';
import type { VoiceOption } from '~/common';
import store from '~/store';

function useTextToSpeechBrowser({
  setIsSpeaking,
}: {
  setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const voiceName = useRecoilValue(store.voice);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const cloudBrowserVoices = useRecoilValue(store.cloudBrowserVoices);
  const [isSpeechSynthesisSupported, setIsSpeechSynthesisSupported] = useState(true);

  const updateVoices = useCallback(() => {
    const synth = window.speechSynthesis as SpeechSynthesis | undefined;
    if (!synth) {
      setIsSpeechSynthesisSupported(false);
      return;
    }

    try {
      const availableVoices = synth.getVoices();
      if (!Array.isArray(availableVoices)) {
        console.error('getVoices() did not return an array');
        return;
      }

      const filteredVoices = availableVoices.filter(
        (v) => cloudBrowserVoices || v.localService === true,
      );
      const voiceOptions: VoiceOption[] = filteredVoices.map((v) => ({
        value: v.name,
        label: v.name,
      }));

      setVoices(voiceOptions);
    } catch (error) {
      console.error('Error updating voices:', error);
      setIsSpeechSynthesisSupported(false);
    }
  }, [cloudBrowserVoices]);

  useEffect(() => {
    const synth = window.speechSynthesis as SpeechSynthesis | undefined;
    if (!synth) {
      setIsSpeechSynthesisSupported(false);
      return;
    }

    try {
      if (synth.getVoices().length) {
        updateVoices();
      } else {
        synth.onvoiceschanged = updateVoices;
      }
    } catch (error) {
      console.error('Error in useEffect:', error);
      setIsSpeechSynthesisSupported(false);
    }

    return () => {
      if (synth.onvoiceschanged) {
        synth.onvoiceschanged = null;
      }
    };
  }, [updateVoices]);

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
