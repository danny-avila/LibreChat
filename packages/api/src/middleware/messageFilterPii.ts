import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import {
  PII_ACTIONS,
  isPiiAction,
  setPiiRoutingDecision,
  createConfirmationToken,
  consumeConfirmationToken,
} from '../pii';
import { getReferencedQuotes, mergeQuotedText } from '../utils/quotes';

type CompiledPattern = { id: string; label: string; pattern: RegExp };

type PresidioResult = {
  start: number;
  end: number;
  entity_type: string;
  score: number;
};

type PresidioAnonymized = { text: string };

const PII_ACTION_FIELD = 'piiAction';
const PII_TOKEN_FIELD = 'piiConfirmationToken';

const getUserId = (req: ServerRequest): string => {
  const user = req.user as IUser | undefined;
  return user?.id ?? user?._id?.toString() ?? '';
};

const getPresidioUrl = (service: 'analyzer' | 'anonymizer'): string | null => {
  const name = service === 'analyzer' ? 'PRESIDIO_ANALYZER_API_BASE' : 'PRESIDIO_ANONYMIZER_API_BASE';
  const value = process.env[name]?.trim();
  return value ? value.replace(/\/$/, '') : null;
};

const postPresidio = async <T>(url: string, body: object): Promise<T> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Presidio returned ${response.status}`);
  }
  return (await response.json()) as T;
};

const analyze = (baseUrl: string, text: string): Promise<PresidioResult[]> =>
  postPresidio(`${baseUrl}/analyze`, { text, language: 'en' });

const anonymize = (
  baseUrl: string,
  text: string,
  analyzerResults: PresidioResult[],
): Promise<PresidioAnonymized> =>
  postPresidio(`${baseUrl}/anonymize`, { text, analyzer_results: analyzerResults });

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
  return async function messageFilterPii(
    req: ServerRequest,
    res: ServerResponse,
    next: NextFunction,
  ) {
    const analyzerUrl = getPresidioUrl('analyzer');
    const anonymizerUrl = getPresidioUrl('anonymizer');
    let text = typeof req.body?.text === 'string' ? req.body.text : '';
    const actionValue = req.body?.[PII_ACTION_FIELD];
    const tokenValue = req.body?.[PII_TOKEN_FIELD];
    delete req.body?.[PII_ACTION_FIELD];
    delete req.body?.[PII_TOKEN_FIELD];

    if (
      (actionValue !== undefined && !isPiiAction(actionValue)) ||
      (actionValue === undefined && tokenValue !== undefined)
    ) {
      res.status(400).json({
        error: 'message_filter_pii_invalid_action',
        message: 'Invalid PII action.',
      });
      return;
    }

    const piiAction = isPiiAction(actionValue) ? actionValue : undefined;
    if (piiAction != null) {
      const userId = getUserId(req);
      const requestId = typeof req.body?.clientRequestId === 'string' ? req.body.clientRequestId : '';
      if (typeof tokenValue !== 'string' || !userId) {
        res.status(400).json({
          error: 'message_filter_pii_invalid_confirmation',
          message: 'PII confirmation is invalid or expired.',
        });
        return;
      }
      try {
        const valid = consumeConfirmationToken({
          token: tokenValue,
          action: piiAction,
          userId,
          text,
          requestId,
        });
        if (!valid) {
          res.status(400).json({
            error: 'message_filter_pii_invalid_confirmation',
            message: 'PII confirmation is invalid or expired.',
          });
          return;
        }
      } catch (error) {
        logger.error('[messageFilter.pii] Confirmation validation failed', (error as Error).message);
        res.status(503).json({
          error: 'message_filter_pii_unavailable',
          message: 'Message could not be inspected for sensitive information. Try again later.',
        });
        return;
      }
    }

    if (analyzerUrl != null && anonymizerUrl != null && text.length > 0) {
      try {
        const results = await analyze(analyzerUrl, text);
        if (results.length > 0 && piiAction == null) {
          const userId = getUserId(req);
          if (!userId) {
            throw new Error('Authenticated user identity is unavailable');
          }
          res.status(409).json({
            error: 'message_filter_pii_confirmation_required',
            requires_confirmation: true,
            entity_types: [...new Set(results.map((result) => result.entity_type))],
            allowed_actions: PII_ACTIONS,
            confirmation_token: createConfirmationToken({
              userId,
              text,
              requestId:
                typeof req.body?.clientRequestId === 'string' ? req.body.clientRequestId : '',
            }),
            message: 'Personally identifiable information was detected. Choose how to continue.',
          });
          return;
        }
        if (results.length > 0 && piiAction === 'anonymize') {
          const result = await anonymize(anonymizerUrl, text, results);
          req.body.text = result.text;
          text = result.text;
        }
        if (piiAction === 'send_as_is') {
          setPiiRoutingDecision(res, { action: 'send_as_is' });
        }
      } catch (error) {
        logger.error('[messageFilter.pii] Presidio inspection failed', (error as Error).message);
        res.status(503).json({
          error: 'message_filter_pii_unavailable',
          message: 'Message could not be inspected for sensitive information. Try again later.',
        });
        return;
      }
    }

    const config = options.getConfig(req);
    if (config == null) {
      next();
      return;
    }
    /**
     * Scan the typed text, each quoted excerpt, and — crucially — the merged
     * blockquote+text exactly as `AgentClient` sends it to the model. Quotes are
     * normalized via `getReferencedQuotes` first (matching `BaseClient`). Scanning
     * the merged string catches a secret split across a quote and the typed text
     * (each clean alone) that only matches once concatenated; scanning the raw
     * pieces keeps anchored patterns working against un-prefixed excerpts.
     */
    const candidates: string[] = [];
    if (text.length > 0) {
      candidates.push(text);
    }
    const quotes = getReferencedQuotes(req.body?.quotes);
    if (quotes != null) {
      candidates.push(...quotes);
      candidates.push(mergeQuotedText(text, quotes));
    }
    /**
     * The shared `/agents/chat/resume` route carries user-authored text in different
     * fields than a typed message: an ask-user `answer`, and a tool-approval decision's
     * `respond` text, `reject` reason, and edited tool arguments. Scan them too — else a
     * blocked token could ride a resume payload straight back into the model/tool,
     * bypassing the filter the typed path enforces.
     */
    if (typeof req.body?.answer === 'string' && req.body.answer.length > 0) {
      candidates.push(req.body.answer);
    }
    if (Array.isArray(req.body?.decisions)) {
      for (const decision of req.body.decisions) {
        if (typeof decision?.responseText === 'string' && decision.responseText.length > 0) {
          candidates.push(decision.responseText);
        }
        if (typeof decision?.reason === 'string' && decision.reason.length > 0) {
          candidates.push(decision.reason);
        }
        if (decision?.editedArguments != null) {
          try {
            const edited = JSON.stringify(decision.editedArguments);
            if (edited.length > 0) {
              candidates.push(edited);
            }
          } catch {
            /* ignore unstringifiable edited args */
          }
        }
      }
    }
    if (candidates.length === 0) {
      next();
      return;
    }
    const patterns = compile(config);
    if (patterns.length === 0) {
      next();
      return;
    }
    for (const candidate of candidates) {
      const match = findMatch(candidate, patterns);
      if (match != null) {
        res.status(400).json({
          error: 'message_filter_pii_block',
          message: `Message contains a ${match.label}. Remove it and try again.`,
        });
        return;
      }
    }
    next();
  };
}
