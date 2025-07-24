import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

export interface CallToolRequestOptions extends RequestOptions {
  tool_call_id?: string;
}
