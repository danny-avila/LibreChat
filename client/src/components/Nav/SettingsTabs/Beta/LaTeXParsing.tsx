import { useRecoilState } from 'recoil';
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
      <div>{localize('com_nav_latex_parsing')} </div>
      <Switch
        id="LaTeXParsing"
        checked={LaTeXParsing}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="LaTeXParsing"
      />
    </div>
  );
}
