import type { Request } from 'express';
import type { IUser, AppConfig } from '@librechat/data-schemas';

/**
 * LibreChat-specific request body type that extends Express Request body
 * (have to use type alias because you can't extend indexed access types like Request['body'])
 */
export type RequestBody = {
  messageId?: string;
  fileTokenLimit?: number;
  conversationId?: string;
  parentMessageId?: string;
};

export type ServerRequest = Request<unknown, unknown, RequestBody> & {
  user?: IUser;
  config?: AppConfig;
};
