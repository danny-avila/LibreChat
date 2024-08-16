import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AtCommandSwitch() {
  const [atCommand, setAtCommand] = useRecoilState<boolean>(store.atCommand);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setAtCommand(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_at_command_description')}</div>
      <Switch
        id="atCommand"
        checked={atCommand}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="atCommand"
      />
    </div>
  );
}
