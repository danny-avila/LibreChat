import { useState } from 'react';
import { useToastContext } from '@librechat/client';
import { useRefineAgentPromptMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface UsePromptRefinementOptions {
  agentId: string;
  currentInstructions: string;
  onSuccess?: (refinedInstructions: string) => void;
}

export default function usePromptRefinement({
  agentId,
  currentInstructions,
  onSuccess,
}: UsePromptRefinementOptions) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const refinePromptMutation = useRefineAgentPromptMutation({
    onSuccess: (data) => {
      showToast({
        message: localize('com_ui_refinement_success'),
        status: 'success',
      });
      onSuccess?.(data.refined_instructions);
      setIsDialogOpen(false);
    },
    onError: (error) => {
      showToast({
        message: error.message || localize('com_ui_refinement_error'),
        status: 'error',
      });
    },
  });

  const handleRefine = (refinementRequest: string) => {
    if (!agentId || !currentInstructions || !refinementRequest) {
      return;
    }

    refinePromptMutation.mutate({
      agent_id: agentId,
      current_instructions: currentInstructions,
      refinement_request: refinementRequest,
    });
  };

  const openDialog = () => setIsDialogOpen(true);
  const closeDialog = () => setIsDialogOpen(false);

  return {
    isDialogOpen,
    isRefining: refinePromptMutation.isLoading,
    openDialog,
    closeDialog,
    handleRefine,
  };
}