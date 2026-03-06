import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  dataService,
  EModelEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import type { TConversation, TPreset, Agent } from 'librechat-data-provider';
import useGetConversation from '~/hooks/Conversations/useGetConversation';
import useDefaultConvo from '~/hooks/Conversations/useDefaultConvo';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useNewConvo from '~/hooks/useNewConvo';
import { logger } from '~/utils';

export default function useSelectAgent() {
  const queryClient = useQueryClient();
  const agentsMap = useAgentsMapContext();
  const getDefaultConversation = useDefaultConvo();
  const { newConversation } = useNewConvo();
  const getConversation = useGetConversation(0);

  const updateConversation = useCallback(
    async (agent: Partial<Agent>, template: Partial<TPreset | TConversation>) => {
      const conversation = await getConversation();
      logger.log('conversation', 'Updating conversation with agent', agent);
      if (isAssistantsEndpoint(conversation?.endpoint)) {
        newConversation({
          template: { ...(template as Partial<TConversation>) },
          preset: template as Partial<TPreset>,
        });
        return;
      }
      const currentConvo = getDefaultConversation({
        conversation: { ...(conversation ?? {}), agent_id: agent.id },
        preset: template,
      });
      newConversation({
        template: currentConvo,
        preset: template as Partial<TPreset>,
        keepLatestMessage: true,
      });
    },
    [getConversation, getDefaultConversation, newConversation],
  );

  const onSelect = useCallback(
    async (value: string) => {
      const agent = agentsMap?.[value];
      if (!agent) {
        return;
      }

      const template: Partial<TPreset | TConversation> = {
        endpoint: EModelEndpoint.agents,
        agent_id: agent.id,
        conversationId: Constants.NEW_CONVO as string,
      };

      await updateConversation({ id: agent.id }, template);

      try {
        const fullAgent = await queryClient.fetchQuery([QueryKeys.agent, agent.id], () =>
          dataService.getAgentById({
            agent_id: agent.id,
          }),
        );
        if (fullAgent) {
          await updateConversation(fullAgent, { ...template, agent_id: fullAgent.id });
        }
      } catch (error) {
        if ((error as { silent: boolean } | undefined)?.silent) {
          console.warn('Current fetch was cancelled');
          return;
        }
        console.error('Error fetching full agent data:', error);
        await updateConversation({}, { ...template, agent_id: undefined });
      }
    },
    [agentsMap, updateConversation, queryClient],
  );

  return { onSelect };
}
