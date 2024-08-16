// client/src/components/Chat/Messages/MessageAudio.tsx
import { memo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessageAudio } from '~/common';
import { BrowserTTS, EdgeTTS, ExternalTTS } from '~/components/Audio/TTS';
import { TTSEndpoints } from '~/common';
import store from '~/store';

function MessageAudio(props: TMessageAudio) {
  const engineTTS = useRecoilValue<string>(store.engineTTS);

  const TTSComponents = {
    [TTSEndpoints.edge]: EdgeTTS,
    [TTSEndpoints.browser]: BrowserTTS,
    [TTSEndpoints.external]: ExternalTTS,
  };

  const SelectedTTS = TTSComponents[engineTTS];
  return <SelectedTTS {...props} />;
}

export default memo(MessageAudio);
