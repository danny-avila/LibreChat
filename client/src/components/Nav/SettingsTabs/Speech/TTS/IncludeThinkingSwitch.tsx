import { useRecoilValue } from 'recoil';
import ToggleSwitch from '../../ToggleSwitch';
import store from '~/store';

export default function IncludeThinkingSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const textToSpeech = useRecoilValue(store.textToSpeech);

  return (
    <ToggleSwitch
      stateAtom={store.includeThinkingInTTS}
      localizationKey={'com_nav_include_thinking_tts' as const}
      switchId="IncludeThinkingTTS"
      onCheckedChange={onCheckedChange}
      disabled={!textToSpeech}
    />
  );
}
