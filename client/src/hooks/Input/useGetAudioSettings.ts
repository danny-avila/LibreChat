import { useRecoilValue } from 'recoil';
import { useMemo } from 'react';
import store from '~/store';

const useGetAudioSettings = () => {
  const engineSTT = useRecoilValue<string>(store.engineSTT);
  const engineTTS = useRecoilValue<string>(store.engineTTS);

  const speechToTextEndpoint = engineSTT;
  const textToSpeechEndpoint = engineTTS;

  return useMemo(
    () => ({ speechToTextEndpoint, textToSpeechEndpoint }),
    [speechToTextEndpoint, textToSpeechEndpoint],
  );
};

export default useGetAudioSettings;
