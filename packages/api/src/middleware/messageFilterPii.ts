import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import { createLegacyPiiInspector, toLegacyPiiMatch } from '../protection/legacy';
import { extractMessageContent } from '../protection/adapters/messages';
import { extractStoredMessageContent } from '../protection/adapters/submissions';
import { extractChatContent } from '../protection/adapters/chat';
import {
  getContentTraversalFragments,
  isContentTraversalLimitError,
  isNestedMessageTraversalProtected,
} from '../protection/adapters/nested';
import { contentFilterUninspectableResponse, getBlockedOpaqueFileField } from '../protection/files';
import { inspectContent } from '../protection/runtime';
import { contentFilterBlockResponse } from './contentFilter';

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
  getFilters?: (req: ServerRequest) => FiltersConfig | undefined;
}

export function createMessageFilterPii(options: CreateMessageFilterPiiOptions): RequestHandler {
  return function messageFilterPii(req: ServerRequest, res: ServerResponse, next: NextFunction) {
    const legacyPii = options.getConfig(req);
    const filters = options.getFilters?.(req);
    if (legacyPii == null && filters == null) {
      next();
      return;
    }
    const uninspectableField = getBlockedOpaqueFileField(filters, req.body);
    if (uninspectableField != null) {
      res.status(400).json(contentFilterUninspectableResponse(uninspectableField));
      return;
    }
    const fragments = [...extractChatContent(req.body)];
    if (filters != null) {
      try {
        fragments.push(...extractStoredMessageContent(req.body));
      } catch (error) {
        if (!isContentTraversalLimitError(error)) {
          next(error);
          return;
        }
        fragments.push(...getContentTraversalFragments(error));
        const partialFinding = inspectContent(fragments, { filters, legacyPii });
        if (partialFinding != null) {
          if (partialFinding.detectorId === 'legacy-pattern') {
            res.status(400).json({
              error: 'message_filter_pii_block',
              message: `Message contains a ${partialFinding.label}. Remove it and try again.`,
            });
          } else {
            res.status(400).json(contentFilterBlockResponse(partialFinding));
          }
          return;
        }
        if (
          isNestedMessageTraversalProtected({
            filters,
            legacyPii,
            roles: [req.body?.role],
          })
        ) {
          res.status(error.statusCode).json(error.body);
          return;
        }
      }
    }
    if (fragments.length === 0) {
      next();
      return;
    }
    const finding = inspectContent(fragments, { filters, legacyPii });
    if (finding == null) {
      next();
      return;
    }
    if (finding.detectorId !== 'legacy-pattern') {
      res.status(400).json(contentFilterBlockResponse(finding));
      return;
    }
    res.status(400).json({
      error: 'message_filter_pii_block',
      message: `Message contains a ${finding.label}. Remove it and try again.`,
    });
  };
}
