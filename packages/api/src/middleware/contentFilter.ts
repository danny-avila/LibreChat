import type {
  NextFunction,
  RequestHandler,
  Request as ServerRequest,
  Response as ServerResponse,
} from 'express';
import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { ProtectionFinding, TextContentFragment } from '../protection/types';
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
import { createConfiguredContentInspector } from '../protection/runtime';
import { extractFileContent } from '../protection/adapters/submissions';

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

export function contentFilterModelBoundBlockResponse(
  finding: Pick<ProtectionFinding, 'source' | 'field'>,
): ContentFilterBlockResponse {
  return {
    error: 'content_filter_block',
    message: 'Submitted content was blocked by content policy.',
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
  getFiles?: GetCanonicalFilesForInspection;
  extract: (req: ServerRequest) => Iterable<TextContentFragment>;
}

export function createContentFilter(options: CreateContentFilterOptions): RequestHandler {
  return async function contentFilter(
    req: ServerRequest,
    res: ServerResponse,
    next: NextFunction,
  ): Promise<void> {
    const filters = options.getFilters(req);
    const legacyPii = options.getLegacyPii?.(req);
    const inspector = createConfiguredContentInspector({ filters, legacyPii });
    let opaqueFileInput = options.getOpaqueFileInput?.(req);
    if (inspector == null && opaqueFileInput == null) {
      next();
      return;
    }

    let hydratedFiles: CanonicalFileInspectionFile[] = [];
    if (opaqueFileInput != null && options.getFiles != null && hasActiveFilePolicy(filters)) {
      try {
        const fileInspection = await resolveCanonicalFileReferences({
          filters,
          input: opaqueFileInput,
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

    const uninspectableField =
      opaqueFileInput == null ? null : getBlockedOpaqueFileField(filters, opaqueFileInput);
    if (uninspectableField != null) {
      res.status(400).json(contentFilterUninspectableResponse(uninspectableField));
      return;
    }
    if (inspector == null) {
      next();
      return;
    }

    let finding: ProtectionFinding | null;
    try {
      const fragments = [...options.extract(req)];
      for (const file of hydratedFiles) {
        fragments.push(...extractFileContent(file));
      }
      finding = inspector.inspect(fragments);
    } catch (error) {
      if (isContentTraversalLimitError(error)) {
        const partialFinding = inspector.inspect(getContentTraversalFragments(error));
        if (partialFinding != null) {
          res.status(400).json(contentFilterBlockResponse(partialFinding));
          return;
        }
        if (
          isContentTraversalProtected({
            error,
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
