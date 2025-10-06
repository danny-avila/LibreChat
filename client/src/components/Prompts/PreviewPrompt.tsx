import { OGDialogContent, OGDialog } from '@librechat/client';
import type { TPromptGroup, TMCPPromptArgument } from 'librechat-data-provider';
import PromptDetails from './PromptDetails';

const PreviewPrompt = ({
  group,
  mcpPrompt,
  open,
  onOpenChange,
  mcp,
}: {
  group?: TPromptGroup;
  mcpPrompt?: TMCPPromptArgument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcp?: boolean;
}) => {
  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="max-h-[90vh] w-11/12 max-w-full overflow-y-auto md:max-w-[60vw]">
        <div className="p-2">
          <PromptDetails group={group} mcpPrompt={mcpPrompt} mcp={mcp} />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default PreviewPrompt;
