import type { TSubmission, TMessage, TEndpointOption } from './types';
import { tConvoUpdateSchema, EModelEndpoint } from './schemas';
import { EndpointURLs } from './config';

export default function createPayload(submission: TSubmission) {
  const { conversation, message, messages, endpointOption, isEdited, isContinued } = submission;
  const { conversationId } = tConvoUpdateSchema.parse(conversation);
  const { endpoint, endpointType } = endpointOption as {
    endpoint: EModelEndpoint;
    endpointType?: EModelEndpoint;
  };

  let server = EndpointURLs[endpointType ?? endpoint];

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
