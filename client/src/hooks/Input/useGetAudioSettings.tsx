import { useRecoilState } from 'recoil';
import store from '~/store';

export enum AudioEndpoints {
  browser = 'browser',
  external = 'external',
}

const useGetAudioSettings = () => {
  const [endpointSTT] = useRecoilState<string>(store.endpointSTT);
  const [endpointTTS] = useRecoilState<string>(store.endpointTTS);

  const useExternalSpeechToText = endpointSTT === AudioEndpoints.external;
  const useExternalTextToSpeech = endpointTTS === AudioEndpoints.external;

  return { useExternalSpeechToText, useExternalTextToSpeech };
};

export default useGetAudioSettings;
