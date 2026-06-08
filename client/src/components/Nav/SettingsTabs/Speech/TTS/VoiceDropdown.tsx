import { BrowserVoiceDropdown, ExternalVoiceDropdown } from '~/components/Audio/Voices';
import { TTSEndpoints } from '~/common';
import { useGetAudioSettings } from '~/hooks';

const voiceDropdownComponentsMap = {
  [TTSEndpoints.browser]: BrowserVoiceDropdown,
  [TTSEndpoints.external]: ExternalVoiceDropdown,
};

export default function VoiceDropdown() {
  const { textToSpeechEndpoint } = useGetAudioSettings();
  const VoiceDropdownComponent = voiceDropdownComponentsMap[textToSpeechEndpoint];

  if (!VoiceDropdownComponent) {
    return null;
  }

  return <VoiceDropdownComponent />;
}
