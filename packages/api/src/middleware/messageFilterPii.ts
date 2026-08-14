import { RE2JS } from 're2js';
import { setMessageFilterRegexValidator } from 'librechat-data-provider';
import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { TextContentFragment } from '../protection/types';
import {
  contentFilterUninspectableResponse,
  getBlockedOpaqueFileField,
  hasActiveFilePolicy,
  resolveCanonicalFileReferences,
  UninspectableFileError,
  type CanonicalFileInspectionFile,
  type GetCanonicalFilesForInspection,
} from '../protection/files';
import {
  ContentTraversalLimitError,
  getContentTraversalFragments,
  isContentTraversalProtected,
  isContentTraversalLimitError,
} from '../protection/adapters/nested';
import {
  extractFileContent,
  extractStoredMessageContent,
} from '../protection/adapters/submissions';
import { createLegacyPiiInspector, toLegacyPiiMatch } from '../protection/legacy';
import { extractMessageContent } from '../protection/adapters/messages';
import { serializeAskUserAnswerVariants } from '../agents/hitl/resume';
import { extractChatContent } from '../protection/adapters/chat';
import { contentFilterBlockResponse } from './contentFilter';
import { inspectContent } from '../protection/runtime';

function isSupportedMessageFilterRegex(pattern: string): boolean {
  try {
    RE2JS.compile(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wire config parsing to the same linear-time regex engine used at runtime.
 * This prevents an operator pattern accepted by JavaScript RegExp but unsupported
 * by RE2 from being silently omitted when the filter is created.
 */
export function configureMessageFilterRegexValidator(): void {
  setMessageFilterRegexValidator(isSupportedMessageFilterRegex);
}

const LEGACY_CONFIG_VALIDITY = new WeakMap<object, boolean>();

function isLegacyPiiConfigValid(config: MessageFilterPiiConfig): boolean {
  const cached = LEGACY_CONFIG_VALIDITY.get(config);
  if (cached != null) {
    return cached;
  }
  const valid = (config.customPatterns ?? []).every((pattern) =>
    isSupportedMessageFilterRegex(pattern.regex),
  );
  LEGACY_CONFIG_VALIDITY.set(config, valid);
  return valid;
}

export interface PiiMatch {
  id: string;
  label: string;
  /** Set when a configured custom pattern cannot be enforced by the runtime engine. */
  misconfigured?: boolean;
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
  if (!isLegacyPiiConfigValid(config)) {
    return { id: '__misconfigured__', label: 'restricted value', misconfigured: true };
  }
  const inspector = createLegacyPiiInspector(config);
  const fragments = extractMessageContent(messages);
  return toLegacyPiiMatch(inspector?.inspect(fragments) ?? null);
}

export interface CreateMessageFilterPiiOptions {
  getConfig: (req: ServerRequest) => MessageFilterPiiConfig | undefined;
  getFilters?: (req: ServerRequest) => FiltersConfig | undefined;
  getFiles?: GetCanonicalFilesForInspection;
}

export function createMessageFilterPii(options: CreateMessageFilterPiiOptions): RequestHandler {
  return async function messageFilterPii(
    req: ServerRequest,
    res: ServerResponse,
    next: NextFunction,
  ) {
    const legacyPii = options.getConfig(req);
    const filters = options.getFilters?.(req);
    if (legacyPii == null && filters == null) {
      next();
      return;
    }
    if (legacyPii != null && !isLegacyPiiConfigValid(legacyPii)) {
      res.status(400).json({
        error: 'message_filter_pii_block',
        message: 'Message filtering is misconfigured; contact your administrator.',
      });
      return;
    }

    let opaqueFileInput = req.body;
    let hydratedFiles: CanonicalFileInspectionFile[] = [];
    if (options.getFiles != null && hasActiveFilePolicy(filters)) {
      try {
        const fileInspection = await resolveCanonicalFileReferences({
          filters,
          input: req.body,
          user: (
            req as ServerRequest & {
              user?: { id?: string; tenantId?: string | null };
            }
          ).user,
          getFiles: options.getFiles,
        });
        opaqueFileInput = fileInspection.sanitizedInput;
        hydratedFiles = fileInspection.hydratedFiles;
      } catch (error) {
        if (error instanceof UninspectableFileError) {
          res.status(error.statusCode).json(error.body);
          return;
        }
        next(error);
        return;
      }
    }

    const uninspectableField = getBlockedOpaqueFileField(filters, opaqueFileInput);
    if (uninspectableField != null) {
      res.status(400).json(contentFilterUninspectableResponse(uninspectableField));
      return;
    }
    const fragments: TextContentFragment[] = [];
    const traversalErrors: ContentTraversalLimitError[] = [];
    const collect = (extract: () => Iterable<TextContentFragment>) => {
      try {
        fragments.push(...extract());
        return true;
      } catch (error) {
        if (!isContentTraversalLimitError(error)) {
          next(error);
          return false;
        }
        fragments.push(...getContentTraversalFragments(error));
        traversalErrors.push(error);
        return true;
      }
    };
    if (!collect(() => extractChatContent(req.body))) {
      return;
    }
    if (
      req.body?.answers != null &&
      typeof req.body.answers === 'object' &&
      !Array.isArray(req.body.answers)
    ) {
      const answerCandidates = [
        ...Object.values(req.body.answers).filter(
          (answer): answer is string => typeof answer === 'string' && answer.length > 0,
        ),
        ...serializeAskUserAnswerVariants(req.body.answers),
      ];
      fragments.push(
        ...extractMessageContent(answerCandidates.map((content) => ({ role: 'user', content }))),
      );
    }
    for (const file of hydratedFiles) {
      fragments.push(...extractFileContent(file));
    }
    if (filters != null && !collect(() => extractStoredMessageContent(req.body))) {
      return;
    }
    const finding = inspectContent(fragments, { filters, legacyPii });
    if (finding != null) {
      if (finding.detectorId !== 'legacy-pattern') {
        res.status(400).json(contentFilterBlockResponse(finding));
        return;
      }
      res.status(400).json({
        error: 'message_filter_pii_block',
        message: `Message contains a ${finding.label}. Remove it and try again.`,
      });
      return;
    }
    const protectedError = traversalErrors.find((error) =>
      isContentTraversalProtected({
        error,
        filters,
        legacyPii,
        roles: [req.body?.role],
      }),
    );
    if (protectedError != null) {
      res.status(protectedError.statusCode).json(protectedError.body);
      return;
    }
    next();
  };
}
