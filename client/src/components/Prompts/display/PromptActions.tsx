import { useState, useMemo, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@librechat/client';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize, useAuthContext, useSubmitMessage } from '~/hooks';
import { useRecordPromptUsage } from '~/data-provider';
import VariableDialog from '../dialogs/VariableDialog';
import SharePrompt from '../dialogs/SharePrompt';
import { detectVariables } from '~/utils';

interface PromptActionsProps {
  group: TPromptGroup;
  onUsePrompt?: () => void;
}

const PromptActions = ({ group, onUsePrompt }: PromptActionsProps) => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { submitPrompt } = useSubmitMessage();
  const recordUsage = useRecordPromptUsage();
  const [showVariableDialog, setShowVariableDialog] = useState(false);

  const mainText = useMemo(() => {
    const initialText = group.productionPrompt?.prompt ?? '';
    return replaceSpecialVars({ text: initialText, user });
  }, [group.productionPrompt?.prompt, user]);

  const hasVariables = useMemo(
    () => detectVariables(group.productionPrompt?.prompt ?? ''),
    [group.productionPrompt?.prompt],
  );

  const handleUsePrompt = useCallback(() => {
    if (hasVariables) {
      setShowVariableDialog(true);
    } else {
      submitPrompt(mainText);
      if (group._id) {
        recordUsage.mutate(group._id);
      }
      onUsePrompt?.();
    }
  }, [hasVariables, submitPrompt, mainText, onUsePrompt, group._id, recordUsage]);

  const handleVariableDialogClose = useCallback(() => {
    setShowVariableDialog(false);
    onUsePrompt?.();
  }, [onUsePrompt]);

  return (
    <>
      <div className="flex w-full gap-2 sm:justify-end sm:gap-3">
        <SharePrompt group={group} disabled={false} />

        <Button
          variant="submit"
          onClick={handleUsePrompt}
          className="flex-1 gap-2 sm:min-w-40 sm:flex-none"
          aria-label={localize('com_ui_use_prompt')}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_use_prompt')}
        </Button>
      </div>

      <VariableDialog open={showVariableDialog} onClose={handleVariableDialogClose} group={group} />
    </>
  );
};

export default PromptActions;
