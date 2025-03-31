import { atomFamily } from 'recoil';
// import { logger } from '~/utils';
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
