import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isEphemeralAgentId, QueryKeys } from 'librechat-data-provider';
import type { TConversation, TAgentJobResponse } from 'librechat-data-provider';
import { useCreateJobMutation } from '~/data-provider/Jobs/mutations';
import { useChatFormContext } from '~/Providers';
import { useToastContext } from '@librechat/client';
import useLocalize from '~/hooks/useLocalize';
import { patchJobInListCache } from './cache';

export default function useStartLongTask() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const methods = useChatFormContext();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const { mutateAsync, isLoading } = useCreateJobMutation();

  const startLongTask = useCallback(
    async (conversation: TConversation | null | undefined) => {
      const goal = methods.getValues('text')?.trim();
      if (!goal) {
        return;
      }

      if (!conversation?.endpoint && !conversation?.agent_id) {
        showToast({
          message: localize('com_ui_job_need_model'),
          status: 'warning',
        });
        return;
      }

      /** Each long task gets its own conversation so jobs never share a thread. */
      const conversationId = crypto.randomUUID();

      try {
        const response = await mutateAsync({
          goal,
          conversationId,
          agent_id:
            conversation?.agent_id && !isEphemeralAgentId(conversation.agent_id)
              ? conversation.agent_id
              : undefined,
          endpoint: conversation?.endpoint ?? undefined,
          endpointType: conversation?.endpointType ?? undefined,
          model: conversation?.model ?? undefined,
          spec: conversation?.spec ?? undefined,
        });

        queryClient.setQueryData<TAgentJobResponse>([QueryKeys.job, response.job._id], response);
        patchJobInListCache(queryClient, response.job);
        queryClient.invalidateQueries([QueryKeys.allConversations]);

        methods.reset();
        navigate(`/c/${conversationId}`, {
          state: { focusChat: true, jobId: response.job._id },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : localize('com_ui_job_start_error');
        showToast({ message, status: 'error' });
      }
    },
    [methods, mutateAsync, navigate, queryClient, showToast, localize],
  );

  return { startLongTask, isStarting: isLoading };
}
