import { ErrorTypes } from 'librechat-data-provider';
import type { SafeErrorMetadata } from '../../utils/errors';
import type { ModelErrorTrackerCallback } from './tracker';
import { getSafeErrorMetadata, isAbortError } from '../../utils/errors';
import { traceIdForMessage } from '../../langfuse/trace';
import { createModelErrorTracker } from './tracker';
import { resolveLangChainError } from '../errors';

const UPSTREAM_MODEL_ERROR_CODE = 'UPSTREAM_MODEL_ERROR';
const UPSTREAM_MODEL_ERROR_ORIGIN = 'model_provider';
const UNKNOWN_UPSTREAM_MODEL_ERROR_TYPE = '_OTHER';
const UPSTREAM_MODEL_ERROR_FALLBACK = 'The model provider could not complete this request.';

function safelyResolveLangChainError(error: unknown): string | undefined {
  try {
    return resolveLangChainError(error);
  } catch {
    return undefined;
  }
}

export interface UpstreamModelErrorMetadata extends SafeErrorMetadata {
  readonly errorCode: typeof UPSTREAM_MODEL_ERROR_CODE;
  readonly errorOrigin: typeof UPSTREAM_MODEL_ERROR_ORIGIN;
  readonly errorType: string;
  readonly traceId?: string;
}

export interface TerminalRunErrorLogger {
  error(message: string, metadata: SafeErrorMetadata | UpstreamModelErrorMetadata): void;
}

export interface TerminalRunErrorObserver {
  readonly modelCallback: ModelErrorTrackerCallback;
  readonly log: (error: unknown, signal?: AbortSignal) => void;
  readonly getUserFacingError: (error: unknown, fallback: () => string) => string;
}

/** A run cancellation requires both host-owned abort state and an abort-shaped rejection. */
export function isAgentRunCancellation(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true && isAbortError(error);
}

export function getUpstreamModelErrorMetadata(
  error: unknown,
  responseMessageId?: string,
): UpstreamModelErrorMetadata {
  const safeMetadata = getSafeErrorMetadata(error);
  return {
    ...safeMetadata,
    errorCode: UPSTREAM_MODEL_ERROR_CODE,
    errorOrigin: UPSTREAM_MODEL_ERROR_ORIGIN,
    errorType:
      safeMetadata.status != null ? String(safeMetadata.status) : UNKNOWN_UPSTREAM_MODEL_ERROR_TYPE,
    ...(typeof responseMessageId === 'string' && responseMessageId !== ''
      ? { traceId: traceIdForMessage(responseMessageId) }
      : {}),
  };
}

/** Applies one terminal-run log taxonomy to every agent ingress. */
export function createTerminalRunErrorObserver({
  logger,
  responseMessageId,
  source,
  genericMessage = `${source} Error:`,
}: {
  logger: TerminalRunErrorLogger;
  responseMessageId?: string;
  source: string;
  genericMessage?: string;
}): TerminalRunErrorObserver {
  const modelErrorTracker = createModelErrorTracker();
  return Object.freeze({
    modelCallback: modelErrorTracker.callback,
    getUserFacingError(error: unknown, fallback: () => string) {
      const upstreamModelError = modelErrorTracker.getUpstreamModelError(error);
      if (upstreamModelError == null) {
        return fallback();
      }

      const classifiedError =
        safelyResolveLangChainError(error) ?? safelyResolveLangChainError(upstreamModelError);
      if (classifiedError != null) {
        return classifiedError;
      }

      const { status } = getSafeErrorMetadata(upstreamModelError);
      return `${UPSTREAM_MODEL_ERROR_FALLBACK}\n${JSON.stringify({
        type: ErrorTypes.UPSTREAM_MODEL_ERROR,
        ...(status != null ? { status } : {}),
      })}`;
    },
    log(error: unknown, signal?: AbortSignal) {
      if (isAgentRunCancellation(error, signal)) {
        return;
      }

      const upstreamModelError = modelErrorTracker.getUpstreamModelError(error);
      if (upstreamModelError == null) {
        logger.error(genericMessage, getSafeErrorMetadata(error));
        return;
      }

      logger.error(
        `${source} Upstream model error`,
        getUpstreamModelErrorMetadata(upstreamModelError, responseMessageId),
      );
    },
  });
}
