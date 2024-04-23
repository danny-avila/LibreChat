import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ConversationModeSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [conversationMode, setConversationMode] = useRecoilState<boolean>(store.conversationMode);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setConversationMode(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_ui_conversation_mode')}</div>
      <Switch
        id="ConversationMode"
        checked={conversationMode}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="ConversationMode"
      />
    </div>
  );
}
