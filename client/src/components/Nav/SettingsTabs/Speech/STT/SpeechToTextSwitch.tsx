import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SpeechToTextSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [speechToText, setSpeechToText] = useRecoilState<boolean>(store.SpeechToText);

  const handleCheckedChange = (value: boolean) => {
    setSpeechToText(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>
        <strong>{localize('com_nav_speech_to_text')}</strong>
      </div>
      <Switch
        id="SpeechToText"
        checked={speechToText}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="SpeechToText"
      />
    </div>
  );
}
