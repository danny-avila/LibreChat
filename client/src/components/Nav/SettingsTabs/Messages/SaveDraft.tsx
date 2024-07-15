import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui/Switch';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

export default function SaveDraft({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [saveDrafts, setSaveDrafts] = useRecoilState<boolean>(store.saveDrafts);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSaveDrafts(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_save_drafts')}</div>
      <Switch
        id="saveDrafts"
        checked={saveDrafts}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2"
        data-testid="saveDrafts"
      />
    </div>
  );
}
