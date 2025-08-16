import type { Request } from 'express';

/**
 * LibreChat-specific request body type that extends Express Request body
 * (have to use type alias because you can't extend indexed access types like Request['body'])
 */
export type RequestBody = Request['body'] & {
  parentMessageId: string;
  messageId: string;
  conversationId?: string;
};
