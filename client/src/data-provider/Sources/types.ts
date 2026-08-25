import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';

/** 한 답변(assistant 메시지)의 저장된 출처 행 — by-conversation API 응답 항목. */
export interface ConversationSourcesMessage {
  request_id: string | null;
  message_id: string;
  created_at: string | null;
  sources: BklSource[];
}

export interface ConversationSourcesResponse {
  conversation_id: string;
  messages: ConversationSourcesMessage[];
}
