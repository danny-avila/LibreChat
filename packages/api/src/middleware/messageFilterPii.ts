import { logger } from '@librechat/data-schemas';
import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { MessageFilterPiiConfig } from 'librechat-data-provider';

type CompiledPattern = { id: string; label: string; pattern: RegExp };

const STARTER_PATTERNS: CompiledPattern[] = [
  { id: 'sk_prefix', label: 'sk- prefix token', pattern: /\b(sk-)[a-zA-Z0-9_-]+/g },
  { id: 'bearer_header', label: 'Bearer token', pattern: /\b(Bearer )[^\s"']+/gi },
  { id: 'api_key_header', label: 'api-key header', pattern: /\b(api-key:?\s+)[^\s"']+/gi },
];

const STARTER_BY_ID = new Map(STARTER_PATTERNS.map((p) => [p.id, p]));

function selectStarter(ids?: string[]): CompiledPattern[] {
  if (ids == null) {
    return STARTER_PATTERNS;
  }
  const out: CompiledPattern[] = [];
  for (const id of ids) {
    const entry = STARTER_BY_ID.get(id);
    if (entry != null) {
      out.push(entry);
    }
  }
  return out;
}

const COMPILE_CACHE = new WeakMap<object, CompiledPattern[]>();

function compile(config: MessageFilterPiiConfig): CompiledPattern[] {
  const cached = COMPILE_CACHE.get(config);
  if (cached != null) {
    return cached;
  }
  const starter = selectStarter(config.starterPatterns);
  const custom: CompiledPattern[] = [];
  for (const p of config.customPatterns ?? []) {
    try {
      custom.push({ id: p.id, label: p.label, pattern: new RegExp(p.regex, 'g') });
    } catch (err) {
      logger.warn(
        `[messageFilter.pii] dropping invalid customPattern ${JSON.stringify(p.id)}: ${(err as Error).message}`,
      );
    }
  }
  const result = [...starter, ...custom];
  COMPILE_CACHE.set(config, result);
  return result;
}

function findMatch(text: string, patterns: CompiledPattern[]): CompiledPattern | null {
  for (const p of patterns) {
    p.pattern.lastIndex = 0;
    if (p.pattern.test(text)) {
      return p;
    }
  }
  return null;
}

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
  const patterns = compile(config);
  if (patterns.length === 0) {
    return null;
  }
  for (const msg of messages) {
    if (msg == null) {
      continue;
    }
    if (typeof msg.content === 'string') {
      const hit = findMatch(msg.content, patterns);
      if (hit != null) {
        return { id: hit.id, label: hit.label };
      }
      continue;
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part != null && typeof part.text === 'string') {
          const hit = findMatch(part.text, patterns);
          if (hit != null) {
            return { id: hit.id, label: hit.label };
          }
        }
      }
    }
  }
  return null;
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
    const text = req.body?.text;
    if (typeof text !== 'string' || text.length === 0) {
      next();
      return;
    }
    const patterns = compile(config);
    if (patterns.length === 0) {
      next();
      return;
    }
    const match = findMatch(text, patterns);
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
