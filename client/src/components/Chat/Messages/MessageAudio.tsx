// client/src/components/Chat/Messages/MessageAudio.tsx
import { memo } from 'react';
import type { TMessageAudio } from '~/common';
import { BrowserTTS, EdgeTTS, ExternalTTS } from '~/components/Audio/TTS';
import { useGetAudioSettings } from '~/hooks';

function MessageAudio(props: TMessageAudio) {
  const { textToSpeechEndpoint } = useGetAudioSettings();

  const TTSComponents = {
    edge: EdgeTTS,
    external: ExternalTTS,
    default: BrowserTTS,
  };

  const SelectedTTS = TTSComponents[textToSpeechEndpoint];
  return <SelectedTTS {...props} />;
}

export default memo(MessageAudio);
