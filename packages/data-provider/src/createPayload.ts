import { tConversationSchema } from './schemas';
import type { TSubmission } from './types';
import { EModelEndpoint, EndpointURLs } from './types';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, endpointOption, isEdited, isContinued } = submission;
  const { conversationId } = tConversationSchema.parse(conversation);
  const { endpoint } = endpointOption as { endpoint: EModelEndpoint };

  let server = EndpointURLs[endpoint];

  if (isEdited && endpoint === EModelEndpoint.assistant) {
    server += '/modify';
  } else if (isEdited) {
    server = server.replace('/ask/', '/edit/');
  }

  const payload = {
    ...message,
    ...endpointOption,
    isContinued: isEdited && isContinued,
    conversationId,
  };

  return { server, payload };
}
