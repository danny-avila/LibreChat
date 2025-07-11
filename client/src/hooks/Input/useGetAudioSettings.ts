import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import store from '~/store';

const useGetAudioSettings = () => {
  const engineSTT = useAtomValue<string>(store.engineSTT);
  const engineTTS = useAtomValue<string>(store.engineTTS);

  const speechToTextEndpoint = engineSTT;
  const textToSpeechEndpoint = engineTTS;

  return useMemo(
    () => ({ speechToTextEndpoint, textToSpeechEndpoint }),
    [speechToTextEndpoint, textToSpeechEndpoint],
  );
};

export default useGetAudioSettings;
