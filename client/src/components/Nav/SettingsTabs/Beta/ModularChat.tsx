import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ModularChatSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [modularChat, setModularChat] = useRecoilState<boolean>(store.modularChat);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setModularChat(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_modular_chat')} </div>
      <Switch
        id="modularChat"
        checked={modularChat}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="modularChat"
      />
    </div>
  );
}
