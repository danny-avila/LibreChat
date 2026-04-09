import { useRecoilState } from 'recoil';
import { Button, Checkbox } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutoSendPrompt({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [autoSendPrompts, setAutoSendPrompts] = useRecoilState<boolean>(store.autoSendPrompts);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setAutoSendPrompts(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => handleCheckedChange(!autoSendPrompts)}
      aria-label={localize('com_nav_auto_send_prompts')}
      aria-pressed={autoSendPrompts}
      className={`relative h-9 w-full gap-2 rounded-lg border-border-light font-medium ${autoSendPrompts ? 'bg-surface-hover hover:bg-surface-hover' : ''}`}
    >
      <Checkbox
        checked={autoSendPrompts}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none"
      />
      {localize('com_nav_auto_send_prompts')}
    </Button>
  );
}
