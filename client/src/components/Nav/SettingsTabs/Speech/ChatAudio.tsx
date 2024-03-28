import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ChatAudioSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [chatAudio, setChatAudio] = useRecoilState<boolean>(store.chatAudio);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setChatAudio(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_ui_chat_audio_automatic')}</div>
      <Switch
        id="ChatAudio"
        checked={chatAudio}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="ChatAudio"
      />
    </div>
  );
}
