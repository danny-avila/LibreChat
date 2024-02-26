export const EVENT_TYPES = {
  PROCESS_PROMPT: 'process_prompt',
  ROUTE_PROMPT: 'route_prompt',
  GENERATE_RESPONSE: 'generate_response',
  PROCESS_RESPONSE: 'process_response',
  MESSAGE: 'message',
  INIT_CONVERSATION: 'init_conversation',
  INIT_INTERACTION: 'init_interaction',
};

export type BaseEvent = {
  event_id: string;
  org_id: string;
  group_ids: string[];
  user_id: string;
  conversation_id: string;
  interaction_id: string | null;
  event_type: string;
  is_error: boolean;
  is_skipped: boolean;
  error_message: string | null;
  exit_handler_chain: boolean;
  timestamp: string;
};

export type InitConversationEvent = BaseEvent & {
  event_type: 'init_conversation';
};

export type InitInteractionEvent = BaseEvent & {
  event_type: 'init_interaction';
  event: {
    raw_prompt: string;
    prev_interaction_id: string | null;
    init_parent_message_id: string | null;
  };
};

export type ProcessPromptEvent = BaseEvent & {
  event_type: 'process_prompt';
  event: {
    moderated_prompt: string;
    system_message: string | null;
    policy_message: string;
  };
};

export type TempUserMessageEvent = BaseEvent & {
  event_type: 'temp__user_message';
  event: {
    parent_message_id: string | null;
    message_id: string;
    is_user_created: boolean;
    body: string;
    system_message: string | null;
    policy_message: string;
  };
};

export type RoutePromptEvent = BaseEvent & {
  event_type: 'route_prompt';
  event: {
    selected_model_id: string;
    reason: string;
    router_prompt: string | null;
  };
};

export type GenerateResponseEvent = BaseEvent & {
  event_type: 'generate_response';
  event: {
    model_id: string;
    raw_response: string;
  };
};

export type ProcessResponseEvent = BaseEvent & {
  event_type: 'process_response';
  event: {
    moderated_response: string;
    system_message: string;
    policy_message: string;
    is_cache_result: boolean;
    original_message_id: string | null;
  };
};

export type TempBotMessageEvent = BaseEvent & {
  event_type: 'temp__bot_message';
  event: {
    parent_message_id: string | null;
    message_id: string;
    is_user_created: boolean;
    body: string;
    moderated_response: string;
    system_message: string;
    policy_message: string;
  };
};

export type MessageEventData = {
  parent_message_id: string | null;
  message_id: string;
  is_user_created: boolean;
  body: string;
  system_message: string | null;
  policy_message: string;
};

export type MessageEvent = BaseEvent & {
  event_type: 'message';
  event: MessageEventData;
};

export type MessageEventType =
  | InitConversationEvent
  | InitInteractionEvent
  | ProcessPromptEvent
  | TempUserMessageEvent
  | RoutePromptEvent
  | GenerateResponseEvent
  | ProcessResponseEvent
  | TempBotMessageEvent
  | MessageEvent;
