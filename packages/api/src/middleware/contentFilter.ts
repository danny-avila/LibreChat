import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { ProtectionFinding, TextContentFragment } from '../protection/types';
import {
  contentFilterUninspectableResponse,
  getBlockedOpaqueFileField,
  UninspectableFileError,
} from '../protection/files';
import {
  ContentTraversalLimitError,
  getContentTraversalFragments,
  isContentTraversalLimitError,
  isNestedMessageTraversalProtected,
} from '../protection/adapters/nested';
import { inspectContent } from '../protection/runtime';

export interface ContentFilterBlockResponse {
  readonly error: 'content_filter_block';
  readonly message: string;
  readonly source: ProtectionFinding['source'];
  readonly field: ProtectionFinding['field'];
}

export function contentFilterBlockResponse(finding: ProtectionFinding): ContentFilterBlockResponse {
  return {
    error: 'content_filter_block',
    message: `Submitted content contains a ${finding.label}. Remove it and try again.`,
    source: finding.source,
    field: finding.field,
  };
}

export class ContentFilterError extends Error {
  public readonly code = 'content_filter_block';
  public readonly statusCode = 400;
  public readonly body: ContentFilterBlockResponse;

  constructor(finding: ProtectionFinding) {
    const body = contentFilterBlockResponse(finding);
    super(body.message);
    this.name = 'ContentFilterError';
    this.body = body;
    Object.setPrototypeOf(this, ContentFilterError.prototype);
  }
}

export function isContentFilterError(
  error: unknown,
): error is ContentFilterError | ContentTraversalLimitError | UninspectableFileError {
  return (
    error instanceof ContentFilterError ||
    error instanceof ContentTraversalLimitError ||
    error instanceof UninspectableFileError
  );
}

export interface CreateContentFilterOptions {
  getFilters: (req: ServerRequest) => FiltersConfig | undefined;
  getLegacyPii?: (req: ServerRequest) => MessageFilterPiiConfig | undefined;
  getMessageRoles?: (req: ServerRequest) => readonly (string | undefined)[];
  getOpaqueFileInput?: (req: ServerRequest) => unknown;
  extract: (req: ServerRequest) => Iterable<TextContentFragment>;
}

export function createContentFilter(options: CreateContentFilterOptions): RequestHandler {
  return function contentFilter(req: ServerRequest, res: ServerResponse, next: NextFunction): void {
    const filters = options.getFilters(req);
    const legacyPii = options.getLegacyPii?.(req);
    if (filters == null && legacyPii == null) {
      next();
      return;
    }

    const uninspectableField =
      options.getOpaqueFileInput == null
        ? null
        : getBlockedOpaqueFileField(filters, options.getOpaqueFileInput(req));
    if (uninspectableField != null) {
      res.status(400).json(contentFilterUninspectableResponse(uninspectableField));
      return;
    }

    let finding: ProtectionFinding | null;
    try {
      finding = inspectContent(options.extract(req), { filters, legacyPii });
    } catch (error) {
      if (isContentTraversalLimitError(error)) {
        const partialFinding = inspectContent(getContentTraversalFragments(error), {
          filters,
          legacyPii,
        });
        if (partialFinding != null) {
          res.status(400).json(contentFilterBlockResponse(partialFinding));
          return;
        }
        if (
          isNestedMessageTraversalProtected({
            filters,
            legacyPii,
            roles: options.getMessageRoles?.(req),
          })
        ) {
          res.status(error.statusCode).json(error.body);
          return;
        }
        next();
        return;
      }
      next(error);
      return;
    }
    if (finding == null) {
      next();
      return;
    }

    res.status(400).json(contentFilterBlockResponse(finding));
  };
}
