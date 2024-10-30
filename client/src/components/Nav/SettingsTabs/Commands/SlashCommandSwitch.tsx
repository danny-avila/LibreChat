import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SlashCommandSwitch() {
  const [slashCommand, setSlashCommand] = useRecoilState<boolean>(store.slashCommand);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSlashCommand(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_slash_command_description')}</div>
      <Switch
        id="slashCommand"
        checked={slashCommand}
        onCheckedChange={handleCheckedChange}
        f
        data-testid="slashCommand"
      />
    </div>
  );
}
