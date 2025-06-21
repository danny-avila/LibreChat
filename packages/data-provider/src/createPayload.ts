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
  const { endpoint: _e } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  const endpoint = _e as s.EModelEndpoint;
  let server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  const isEphemeral = s.isEphemeralAgent(endpoint, ephemeralAgent);

  if (isEdited && s.isAssistantsEndpoint(endpoint)) {
    server += '/modify';
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    endpoint,
    ephemeralAgent: isEphemeral ? ephemeralAgent : undefined,
    isContinued: !!(isEdited && isContinued),
    conversationId,
    isTemporary,
  };

  return { server, payload };
}
