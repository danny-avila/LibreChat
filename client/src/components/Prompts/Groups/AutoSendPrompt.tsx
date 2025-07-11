import { Cog } from 'lucide-react';
import { useRecoilState } from 'recoil';
import {
  Label,
  Switch,
  Button,
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogTitle,
} from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export default function AutoSendPrompt({
  onCheckedChange,
  className = '',
}: {
  onCheckedChange?: (value: boolean) => void;
  className?: string;
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
    <>
      <OGDialog>
        <OGDialogTrigger className="flex items-center justify-center">
          <Button size="sm" variant="outline" className="bg-transparent hover:bg-surface-hover">
            <Cog className="h-4 w-4 text-text-primary" />
          </Button>
        </OGDialogTrigger>
        <OGDialogContent className="w-96">
          <OGDialogTitle className="text-lg font-semibold">
            {localize('com_ui_prompts_settings')}
          </OGDialogTitle>

          <div className={cn('flex justify-between text-text-secondary', className)}>
            <Label>{localize('com_nav_auto_send_prompts')}</Label>
            <Switch
              aria-label="toggle-auto-send-prompts"
              id="autoSendPrompts"
              checked={autoSendPrompts}
              onCheckedChange={handleCheckedChange}
              data-testid="autoSendPrompts"
            />
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
