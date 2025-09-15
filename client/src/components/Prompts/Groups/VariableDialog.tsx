import React, { useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { MCPPromptResponse, TPromptGroup } from 'librechat-data-provider';
import { OGDialog, OGDialogTitle, OGDialogContent } from '@librechat/client';
import { detectVariables } from '~/utils';
import VariableForm from './VariableForm';

interface VariableDialogProps extends Omit<DialogPrimitive.DialogProps, 'onOpenChange'> {
  onClose: () => void;
  group: TPromptGroup | null;
  mcpPrompt: MCPPromptResponse;
  mcp;
}

const VariableDialog: React.FC<VariableDialogProps> = ({
  open,
  onClose,
  group,
  mcpPrompt,
  mcp,
}) => {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
  let hasVariables;
  if (mcp) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    hasVariables = useMemo(
      () => detectVariables(mcpPrompt?.description ?? ''),
      [mcpPrompt?.description],
    );
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    hasVariables = useMemo(
      () => detectVariables(group?.productionPrompt?.prompt ?? ''),
      [group?.productionPrompt?.prompt],
    );
  }
  if (!group) {
    return null;
  }

  if (!hasVariables) {
    return null;
  }
  const groupName = group?.name ?? mcpPrompt?.name;
  return (
    <OGDialog open={open} onOpenChange={handleOpenChange}>
      <OGDialogContent className="max-h-[90vh] max-w-full overflow-y-auto bg-white dark:border-gray-700 dark:bg-gray-850 dark:text-gray-300 md:max-w-[60vw]">
        <OGDialogTitle>{groupName}</OGDialogTitle>
        <VariableForm group={group} mcpPrompt={mcpPrompt} mcp={mcp} onClose={onClose} />
      </OGDialogContent>
    </OGDialog>
  );
};

export default VariableDialog;
