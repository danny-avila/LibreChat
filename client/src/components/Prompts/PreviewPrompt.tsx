import { OGDialogContent, OGDialog } from '@bizu/client';
import type { TPromptGroup } from 'bizu-data-provider';
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
      <OGDialogContent className="max-h-[90vh] w-11/12 max-w-full overflow-y-auto md:max-w-[60vw]">
        <div>
          <PromptDetails group={group} />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default PreviewPrompt;
