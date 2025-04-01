import { atomFamily } from 'recoil';
import { useRecoilCallback } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { logger } from '~/utils';
export type TEphemeralAgent = {
  mcp: string[];
};
export const ephemeralAgentByConvoId = atomFamily<TEphemeralAgent | null, string>({
  key: 'ephemeralAgentByConvoId',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        const conversationId = node.key.split('__')[1];
        // logger.log('agents', 'Setting ephemeral agent:', { conversationId, newValue });
        console.log('agents', 'Setting ephemeral agent:', {
          conversationId,
          newValue,
          key: node.key,
        });
      });
    },
  ] as const,
});

/**
 * Creates a callback function to apply the ephemeral agent state
 * from the "new" conversation template to a specified conversation ID.
 */
export function useApplyNewAgentTemplate() {
  const applyTemplate = useRecoilCallback(
    ({ snapshot, set }) =>
      async (targetConversationId: string) => {
        logger.log(
          'agents',
          `Attempting to apply template from "${Constants.NEW_CONVO}" to "${targetConversationId}"`,
        );

        if (targetConversationId === Constants.NEW_CONVO) {
          logger.warn(
            'agents',
            `Attempted to apply template to itself ("${Constants.NEW_CONVO}"). Skipping.`,
          );
          return;
        }

        try {
          // 1. Get the current agent state from the "new" conversation template using snapshot
          // getPromise reads the value without subscribing
          const agentTemplate = await snapshot.getPromise(
            ephemeralAgentByConvoId(Constants.NEW_CONVO),
          );

          // 2. Check if a template state actually exists
          if (agentTemplate) {
            logger.log(
              'agents',
              `Applying agent template to "${targetConversationId}":`,
              agentTemplate,
            );
            // 3. Set the state for the target conversation ID using the template value
            set(ephemeralAgentByConvoId(targetConversationId), agentTemplate);
          } else {
            // 4. Handle the case where the "new" template has no agent state (is null)
            logger.warn(
              'agents',
              `Agent template from "${Constants.NEW_CONVO}" is null or unset. Setting agent for "${targetConversationId}" to null.`,
            );
            // Explicitly set to null (or a default empty state if preferred)
            set(ephemeralAgentByConvoId(targetConversationId), null);
            // Example: Or set to a default empty state:
            // set(ephemeralAgentByConvoId(targetConversationId), { mcp: [] });
          }
        } catch (error) {
          logger.error(
            'agents',
            `Error applying agent template from "${Constants.NEW_CONVO}" to "${targetConversationId}":`,
            error,
          );
          set(ephemeralAgentByConvoId(targetConversationId), null);
        }
      },
    [],
  );

  return applyTemplate;
}
