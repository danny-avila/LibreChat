import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function LatexParsingSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [latexParsing, setLatexParsing] = useRecoilState<boolean>(store.latexParsing);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setLatexParsing(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_latex_parsing')} </div>
      <Switch
        id="latexParsing"
        checked={latexParsing}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="latexParsing"
      />
    </div>
  );
}
