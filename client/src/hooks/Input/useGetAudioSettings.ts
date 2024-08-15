import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export enum STTEndpoints {
  browser = 'browser',
  external = 'external',
}

export enum TTSEndpoints {
  browser = 'browser',
  edge = 'edge',
  external = 'external',
}

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
