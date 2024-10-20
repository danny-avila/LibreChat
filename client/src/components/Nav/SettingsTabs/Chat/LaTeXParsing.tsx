import { useRecoilState } from 'recoil';
import HoverCardSettings from '../HoverCardSettings';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function LaTeXParsingSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [LaTeXParsing, setLaTeXParsing] = useRecoilState<boolean>(store.LaTeXParsing);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setLaTeXParsing(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_latex_parsing')}</div>
        <HoverCardSettings side="bottom" text="com_nav_info_latex_parsing" />
      </div>
      <Switch
        id="LaTeXParsing"
        checked={LaTeXParsing}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="LaTeXParsing"
      />
    </div>
  );
}
