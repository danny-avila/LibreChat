import { tConversationSchema } from './schemas';
import type { TSubmission, TMessage, TEndpointOption } from './types';
import { EModelEndpoint, EndpointURLs } from './types';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, messages, endpointOption, isEdited, isContinued } = submission;
  const { conversationId } = tConversationSchema.parse(conversation);
  const { endpoint } = endpointOption as { endpoint: EModelEndpoint };

  let server = EndpointURLs[endpoint];

  if (isEdited && endpoint === EModelEndpoint.assistant) {
    server += '/modify';
  } else if (isEdited) {
    server = server.replace('/ask/', '/edit/');
  }

  type Payload = Partial<TMessage> &
    Partial<TEndpointOption> & {
      isContinued: boolean;
      conversationId: string | null;
      messages?: typeof messages;
    };

  const payload: Payload = {
    ...message,
    ...endpointOption,
    isContinued: !!(isEdited && isContinued),
    conversationId,
  };

  if (endpoint === EModelEndpoint.assistant) {
    payload.messages = messages;
  }

  return { server, payload };
}
