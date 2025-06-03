import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function PlusCommandSwitch() {
  const [plusCommand, setPlusCommand] = useRecoilState<boolean>(store.plusCommand);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setPlusCommand(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_plus_command_description')}</div>
      <Switch
        id="plusCommand"
        checked={plusCommand}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="plusCommand"
      />
    </div>
  );
}
