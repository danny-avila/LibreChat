import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { MessagePiiFilterConfig } from 'librechat-data-provider';

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

function compile(config: MessagePiiFilterConfig): CompiledPattern[] {
  const starter = selectStarter(config.starterPatterns);
  const custom = (config.customPatterns ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    pattern: new RegExp(p.regex, 'g'),
  }));
  return [...starter, ...custom];
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

export interface CreateMessagePiiFilterOptions {
  getConfig: (req: ServerRequest) => MessagePiiFilterConfig | undefined;
}

export function createMessagePiiFilter(options: CreateMessagePiiFilterOptions): RequestHandler {
  return function messagePiiFilter(req: ServerRequest, res: ServerResponse, next: NextFunction) {
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
      error: 'message_pii_filter_block',
      message: `Message contains a ${match.label}. Remove it and try again.`,
    });
  };
}
