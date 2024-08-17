import { useRecoilState, useRecoilValue } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutoTranscribeAudioSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [autoTranscribeAudio, setAutoTranscribeAudio] = useRecoilState<boolean>(
    store.autoTranscribeAudio,
  );
  const speechToText = useRecoilValue(store.speechToText);

  const handleCheckedChange = (value: boolean) => {
    setAutoTranscribeAudio(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_auto_transcribe_audio')}</div>
      <Switch
        id="AutoTranscribeAudio"
        checked={autoTranscribeAudio}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="AutoTranscribeAudio"
        disabled={!speechToText}
      />
    </div>
  );
}
