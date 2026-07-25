import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import { createLegacyPiiInspector, toLegacyPiiMatch } from '../protection/legacy';
import { extractMessageContent } from '../protection/adapters/messages';
import { extractChatContent } from '../protection/adapters/chat';

export interface PiiMatch {
  id: string;
  label: string;
}

type ContentPart = { type?: string; text?: string; [key: string]: unknown };
type ChatLikeMessage = {
  role?: string;
  content?: string | ContentPart[];
};

export function findPiiMatchInMessages(
  messages: ChatLikeMessage[] | undefined,
  config: MessageFilterPiiConfig | undefined,
): PiiMatch | null {
  if (config == null || !Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  const inspector = createLegacyPiiInspector(config);
  const fragments = extractMessageContent(messages);
  return toLegacyPiiMatch(inspector?.inspect(fragments) ?? null);
}

export interface CreateMessageFilterPiiOptions {
  getConfig: (req: ServerRequest) => MessageFilterPiiConfig | undefined;
}

export function createMessageFilterPii(options: CreateMessageFilterPiiOptions): RequestHandler {
  return function messageFilterPii(req: ServerRequest, res: ServerResponse, next: NextFunction) {
    const config = options.getConfig(req);
    if (config == null) {
      next();
      return;
    }
    const fragments = extractChatContent(req.body);
    if (fragments.length === 0) {
      next();
      return;
    }
    const match = toLegacyPiiMatch(createLegacyPiiInspector(config)?.inspect(fragments) ?? null);
    if (match == null) {
      next();
      return;
    }
    res.status(400).json({
      error: 'message_filter_pii_block',
      message: `Message contains a ${match.label}. Remove it and try again.`,
    });
  };
}
