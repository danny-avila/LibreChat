import { tarsFetch } from './client';

export interface TarsConversationInput {
  name: string;
  domainId?: string | null;
  modelName?: string | null;
  systemInstruction?: string | null;
}

export interface TarsMessageInput {
  conversationId: string;
  query: string;
  response: string;
  modelName?: string | null;
  messageTokens?: number;
  responseTokens?: number;
}

/**
 * Creates a pwc_tars conversation (`POST /api/conversation/create_conversation`)
 * so a LibreChat conversation can be mirrored into pwc_tars. Returns the new
 * pwc_tars conversation id, or null if pwc_tars returns an unexpected payload.
 */
export async function createTarsConversation(
  tarsId: string,
  input: TarsConversationInput,
  baseUrl?: string,
): Promise<string | null> {
  const data = await tarsFetch<{ conversation?: { id?: string } }>(
    '/api/conversation/create_conversation',
    {
      method: 'POST',
      body: {
        name: input.name,
        domain_id: input.domainId ?? null,
        model_name: input.modelName ?? null,
        system_instruction: input.systemInstruction ?? null,
        created_by: tarsId,
      },
      baseUrl,
    },
  );
  return data?.conversation?.id ?? null;
}

/**
 * Mirrors one LibreChat query/response turn into a pwc_tars message
 * (`POST /api/message/create_message`). `message` stores the raw turn as JSON
 * (pwc_tars uses it for the request payload); `response` holds the answer text.
 */
export async function createTarsMessage(
  tarsId: string,
  input: TarsMessageInput,
  baseUrl?: string,
): Promise<void> {
  await tarsFetch('/api/message/create_message', {
    method: 'POST',
    body: {
      conversation_id: input.conversationId,
      query: input.query,
      response: input.response,
      message: JSON.stringify({
        source: 'librechat',
        query: input.query,
        response: input.response,
      }),
      model_name: input.modelName ?? null,
      message_tokens: input.messageTokens ?? 0,
      response_tokens: input.responseTokens ?? 0,
      status: 1,
      created_by: tarsId,
    },
    baseUrl,
  });
}

/**
 * Soft-deletes the linked pwc_tars conversation and its messages
 * (`DELETE /api/conversation/delete_conversation/:id`) when the LibreChat
 * conversation is deleted. `knowledge_base_id` is required by pwc_tars but only
 * used to remove per-conversation memory files (none for mirrored chats), so a
 * placeholder is sent.
 */
export async function deleteTarsConversation(
  tarsId: string,
  tarsConversationId: string,
  baseUrl?: string,
): Promise<void> {
  await tarsFetch(
    `/api/conversation/delete_conversation/${encodeURIComponent(tarsConversationId)}`,
    {
      method: 'DELETE',
      query: { user_id: tarsId, knowledge_base_id: 'librechat' },
      baseUrl,
    },
  );
}

/**
 * Batch soft-delete of multiple linked pwc_tars conversations
 * (`DELETE /api/conversation/delete_conversations`), used when LibreChat clears
 * all or many conversations at once. See {@link deleteTarsConversation} for the
 * `knowledge_base_id` placeholder rationale.
 */
export async function deleteTarsConversations(
  tarsId: string,
  tarsConversationIds: string[],
  baseUrl?: string,
): Promise<void> {
  if (!tarsConversationIds.length) {
    return;
  }
  await tarsFetch('/api/conversation/delete_conversations', {
    method: 'DELETE',
    body: {
      conversation_ids: tarsConversationIds,
      knowledge_base_id: 'librechat',
      user_id: tarsId,
    },
    baseUrl,
  });
}
