import { Policy } from "./policy";

export type Conversation = {
  bot_response_history: BotResponse[];
  most_recent_message: null;
  org_id: string;
  start_time: string;
  user_id: string;
  conversation_id: string;
};

export type BotResponse = {
  conversation_id: null;
  exit_handler_chain: boolean;
  generate_result: null | GenerateResult;
  is_error: boolean;
  moderated_prompt: null | string;
  policy_msg: string;
  prompt_policy_results: null | PrompPolicyResults;
  raw_prompt: string;
  raw_response: null | string;
  response_policy_results: null | ResponsePolicyResults;
  response_text: string;
  router_result: RouterResult;
  _system_msg: string;
};

export type RouterResult = {
  error_msg: string;
  is_error: boolean;
  reason: string;
  router_prompt: null;
  selected_model: string;
};

export type GenerateResult = {
  error_msg: string;
  is_error: boolean;
  response_text: string;
  selected_model_id: string;
  skipped: boolean;
};

export type PrompPolicyResults = {
  block_applied: false;
  input_text: string;
  is_error: boolean;
  modified_text: string;
  policy_results: Record<string, Policy[]>;
};

export type ResponsePolicyResults = PrompPolicyResults;
