import { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { normalizeSTTEndpoint, normalizeTTSEndpoint } from './audioEndpoints';
import store from '~/store';

const useGetAudioSettings = () => {
  const engineSTT = useRecoilValue<string>(store.engineSTT);
  const engineTTS = useRecoilValue<string>(store.engineTTS);
  const sttExternal = useRecoilValue<boolean>(store.sttExternal);
  const ttsExternal = useRecoilValue<boolean>(store.ttsExternal);

  const speechToTextEndpoint = normalizeSTTEndpoint(engineSTT, sttExternal);
  const textToSpeechEndpoint = normalizeTTSEndpoint(engineTTS, ttsExternal);

  return useMemo(
    () => ({ speechToTextEndpoint, textToSpeechEndpoint }),
    [speechToTextEndpoint, textToSpeechEndpoint],
  );
};

export default useGetAudioSettings;
