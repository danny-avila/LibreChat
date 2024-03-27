import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SpeechToTextSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [speechToText, setSpeechToText] = useRecoilState<boolean>(store.SpeechToText);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSpeechToText(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_speech_to_text')} </div>
      <Switch
        id="SpeechToText"
        checked={speechToText}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="SpeechToText"
      />
    </div>
  );
}
