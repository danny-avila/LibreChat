import { useRecoilState } from 'recoil';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function UserMsgMarkdownSwitch({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const localize = useLocalize();
  const [enableUserMsgMarkdown, setEnableUserMsgMarkdown] = useRecoilState<boolean>(
    store.enableUserMsgMarkdown,
  );

  const handleCheckedChange = (value: boolean) => {
    setEnableUserMsgMarkdown(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div> {localize('com_nav_user_msg_markdown')} </div>
      <Switch
        id="enableUserMsgMarkdown"
        checked={enableUserMsgMarkdown}
        onCheckedChange={handleCheckedChange}
        className="ml-4 mt-2 ring-ring-primary"
        data-testid="enableUserMsgMarkdown"
      />
    </div>
  );
}
