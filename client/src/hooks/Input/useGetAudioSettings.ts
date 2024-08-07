import { useRecoilState } from 'recoil';
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
  const [engineSTT] = useRecoilState<string>(store.engineSTT);
  const [engineTTS] = useRecoilState<string>(store.engineTTS);

  const speechToTextEndpoint: STTEndpoints = engineSTT as STTEndpoints;
  const textToSpeechEndpoint: TTSEndpoints = engineTTS as TTSEndpoints;

  return { speechToTextEndpoint, textToSpeechEndpoint };
};

export default useGetAudioSettings;
