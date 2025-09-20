import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const {
    isEdited,
    userMessage,
    isContinued,
    isTemporary,
    isRegenerate,
    conversation,
    editedContent,
    ephemeralAgent,
    endpointOption,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint: _e, endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  const endpoint = _e as s.EModelEndpoint;
  let server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  if (s.isAssistantsEndpoint(endpoint)) {
    server =
      EndpointURLs[(endpointType ?? endpoint) as 'assistants' | 'azureAssistants'] +
      (isEdited ? '/modify' : '');
  } else if (endpoint === s.EModelEndpoint.a2a) {
    server = EndpointURLs[s.EModelEndpoint.a2a];
  }

  let payload: t.TPayload;
  
  if (endpoint === s.EModelEndpoint.a2a) {
    // A2A endpoints expect different payload format
    const agentId = endpointOption?.model || 
                   endpointOption?.modelLabel || 
                   'a2a-mock-langchain-a2a-agent-57cd14df'; // Fallback to registered agent ID
    payload = {
      agentId: agentId,
      message: userMessage.text,
      conversationId: conversationId,
      taskBased: false, // Default to direct chat mode
      streaming: true,
    } as any; // Cast to any since A2A payload has different structure
  } else {
    payload = {
      ...userMessage,
      ...endpointOption,
      endpoint,
      isTemporary,
      isRegenerate,
      editedContent,
      conversationId,
      isContinued: !!(isEdited && isContinued),
      ephemeralAgent: s.isAssistantsEndpoint(endpoint) ? undefined : ephemeralAgent,
    };
  }

  return { server, payload };
}
