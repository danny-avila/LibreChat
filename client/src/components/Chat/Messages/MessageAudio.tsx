// client/src/components/Chat/Messages/MessageAudio.tsx
import { memo } from 'react';
import type { TMessageAudio } from '~/common';
import { BrowserTTS, EdgeTTS, ExternalTTS } from '~/components/Audio/TTS';
import { useGetAudioSettings } from '~/hooks';
import { TTSEndpoints } from '~/common';

function MessageAudio(props: TMessageAudio) {
  const { textToSpeechEndpoint } = useGetAudioSettings();

  const TTSComponents = {
    [TTSEndpoints.edge]: EdgeTTS,
    [TTSEndpoints.browser]: BrowserTTS,
    [TTSEndpoints.external]: ExternalTTS,
  };

  const SelectedTTS = TTSComponents[textToSpeechEndpoint];
  return <SelectedTTS {...props} />;
}

export default memo(MessageAudio);
