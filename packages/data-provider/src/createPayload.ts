import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const {
    conversation,
    userMessage,
    endpointOption,
    isEdited,
    isContinued,
    isTemporary,
    ephemeralAgent,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint, endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  let server = EndpointURLs[endpointType ?? endpoint];
  const isEphemeralAgent = (ephemeralAgent?.mcp?.length ?? 0) > 0 && !s.isAgentsEndpoint(endpoint);

  if (isEdited && s.isAssistantsEndpoint(endpoint)) {
    server += '/modify';
  } else if (isEdited) {
    server = server.replace('/ask/', '/edit/');
  } else if (isEphemeralAgent) {
    server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    ephemeralAgent: isEphemeralAgent ? ephemeralAgent : undefined,
    isContinued: !!(isEdited && isContinued),
    conversationId,
    isTemporary,
  };

  return { server, payload };
}
