import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const { conversation, userMessage, endpointOption, isEdited, isContinued } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint, endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  let server = EndpointURLs[endpointType ?? endpoint];

  if (isEdited && s.isAssistantsEndpoint(endpoint)) {
    server += '/modify';
  } else if (isEdited) {
    server = server.replace('/ask/', '/edit/');
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    isContinued: !!(isEdited && isContinued),
    conversationId,
  };

  return { server, payload };
}
