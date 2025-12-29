import { OGDialogContent, OGDialog } from '@librechat/client';
import type { TPromptGroup } from 'librechat-data-provider';
import PromptDetails from './PromptDetails';

const PreviewPrompt = ({
  group,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  group: TPromptGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: () => void;
}) => {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        className="max-h-[90vh] w-11/12 max-w-full overflow-y-auto md:max-w-[60vw]"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div>
          <PromptDetails group={group} />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default PreviewPrompt;
