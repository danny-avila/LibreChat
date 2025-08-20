import { useRecoilState } from 'recoil';
import { Switch, InfoHoverCard, ESide } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function SaveDraft({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [showThinking, setSaveDrafts] = useRecoilState<boolean>(store.showThinking);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setSaveDrafts(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <div>{localize('com_nav_show_thinking')}</div>
        <InfoHoverCard side={ESide.Bottom} text={localize('com_nav_info_show_thinking')} />
      </div>
      <Switch
        id="showThinking"
        checked={showThinking}
        onCheckedChange={handleCheckedChange}
        className="ml-4"
        data-testid="showThinking"
      />
    </div>
  );
}
