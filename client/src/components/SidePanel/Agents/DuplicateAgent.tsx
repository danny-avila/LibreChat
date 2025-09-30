import { CopyIcon } from 'lucide-react';
import { useToastContext, Button } from '@librechat/client';
import { useDuplicateAgentMutation } from '~/data-provider';
import { isEphemeralAgent } from '~/common';
import { useLocalize } from '~/hooks';

export default function DuplicateAgent({ agent_id }: { agent_id: string }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const duplicateAgent = useDuplicateAgentMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_agent_duplicated'),
        status: 'success',
      });
    },
    onError: (error) => {
      console.error(error);
      showToast({
        message: localize('com_ui_agent_duplicate_error'),
        status: 'error',
      });
    },
  });

  if (isEphemeralAgent(agent_id)) {
    return null;
  }

  const handleDuplicate = () => {
    duplicateAgent.mutate({ agent_id });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={localize('com_ui_duplicate') + ' ' + localize('com_ui_agent')}
      type="button"
      onClick={handleDuplicate}
    >
      <div className="flex w-full items-center justify-center gap-2 text-primary">
        <CopyIcon className="size-4" />
      </div>
    </Button>
  );
}
