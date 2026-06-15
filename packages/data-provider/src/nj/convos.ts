import { MutationOptions } from 'src/types/mutations';
import { TConversation } from 'src/schemas';

export type TPinConversationRequest = {
  conversationId: string;
  pinned: boolean;
};

export type TPinConversationResponse = TConversation;

export type PinConversationOptions = MutationOptions<
  TPinConversationResponse,
  TPinConversationRequest
>;
