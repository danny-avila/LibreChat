import { useRecoilState } from 'recoil';
import store from '~/store';

export enum AudioEndpoints {
  browser = 'browser',
  external = 'external',
}

const useGetAudioSettings = () => {
  const [engineSTT] = useRecoilState<string>(store.engineSTT);
  const [engineTTS] = useRecoilState<string>(store.engineTTS);

  const useExternalSpeechToText = engineSTT === AudioEndpoints.external;
  const useExternalTextToSpeech = engineTTS === AudioEndpoints.external;

  return { useExternalSpeechToText, useExternalTextToSpeech };
};

export default useGetAudioSettings;
