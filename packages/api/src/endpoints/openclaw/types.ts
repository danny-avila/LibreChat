/** Thinking level supported by the OpenClaw gateway */
export type OpenClawThinkLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface OpenClawToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  source: 'core' | 'plugin';
}

export interface OpenClawSkillEntry {
  name: string;
  description: string;
}

export interface OpenClawModelEntry {
  id: string;
  label: string;
  provider: string;
}

/** Content block types emitted by the OpenClaw gateway */
export type OpenClawContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** Streaming event from the OpenClaw gateway `chat.send` RPC */
export interface OpenClawChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message: {
    role: string;
    content: OpenClawContentBlock[];
  };
  usage?: { input: number; output: number; total: number };
  stopReason?: string;
  errorMessage?: string;
}
