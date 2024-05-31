import { useRecoilState } from 'recoil';
import store from '~/store';

export enum AudioEndpoints {
  browser = 'browser',
  external = 'external',
}

const useGetAudioSettings = () => {
  const [engineSTT] = useRecoilState<string>(store.engineSTT);
  const [engineTTS] = useRecoilState<string>(store.engineTTS);

  const externalSpeechToText = engineSTT === AudioEndpoints.external;
  const externalTextToSpeech = engineTTS === AudioEndpoints.external;

  return { externalSpeechToText, externalTextToSpeech };
};

export default useGetAudioSettings;
