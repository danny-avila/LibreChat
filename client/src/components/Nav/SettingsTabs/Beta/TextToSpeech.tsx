import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function TextToSpeechSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [TextToSpeech, setTextToSpeech] = useRecoilState<boolean>(store.TextToSpeech);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setTextToSpeech(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_text_to_speech')} </div>
      <Switch
        id="TextToSpeech"
        checked={TextToSpeech}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="TextToSpeech"
      />
    </div>
  );
}
