import { memo } from 'react';
import { useAtomValue } from 'jotai';
import type { TMessageAudio } from '~/common';
import { BrowserTTS, ExternalTTS } from '~/components/Audio/TTS';
import { TTSEndpoints } from '~/common';
import store from '~/store';

function MessageAudio(props: TMessageAudio) {
  const engineTTS = useAtomValue<string>(store.engineTTS);

  const TTSComponents = {
    [TTSEndpoints.browser]: BrowserTTS,
    [TTSEndpoints.external]: ExternalTTS,
  };

  const SelectedTTS = TTSComponents[engineTTS];
  if (!SelectedTTS) {
    return null;
  }
  return <SelectedTTS {...props} />;
}

export default memo(MessageAudio);
