import type { TPromptGroup } from 'librechat-data-provider';
import { OGDialogContent, OGDialog } from '~/components/ui';
import PromptDetails from './PromptDetails';

const PreviewPrompt = ({
  group,
  open,
  onOpenChange,
}: {
  group: TPromptGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-w-3xl bg-white dark:border-gray-700 dark:bg-gray-850 dark:text-gray-300">
        <div className="p-2">
          <PromptDetails group={group} />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default PreviewPrompt;
