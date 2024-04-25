import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ConversationModeSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [conversationMode, setConversationMode] = useRecoilState<boolean>(store.conversationMode);
  const [textToSpeech] = useRecoilState<boolean>(store.TextToSpeech);

  const handleCheckedChange = (value: boolean) => {
    setConversationMode(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_conversation_mode')}</div>
      <Switch
        id="ConversationMode"
        checked={conversationMode}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="ConversationMode"
        disabled={!textToSpeech}
      />
    </div>
  );
}
