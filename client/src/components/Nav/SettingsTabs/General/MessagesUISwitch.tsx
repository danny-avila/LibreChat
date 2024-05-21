import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function MessagesUISwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [messagesUI, setMessagesUI] = useRecoilState<boolean>(store.messagesUI);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setMessagesUI(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div> {localize('com_nav_messages_ui')} </div>
      <Switch
        id="messagesUI"
        checked={messagesUI}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="messagesUI"
      />
    </div>
  );
}
