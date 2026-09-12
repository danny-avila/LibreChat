import type {
  TTracePage,
  TTraceErrorCode,
  TTraceRecordDetail,
  TResolvedTraceViewerConfig,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';

/** One authorized read: the caller has already proven `userId` owns `conversationId`. */
export interface TraceQuery {
  userId: string;
  conversationId: string;
  appConfig?: AppConfig;
  settings: TResolvedTraceViewerConfig;
}

/**
 * The seam between LibreChat's trace routes and a tracing backend. An
 * implementation maps its storage into the provider-neutral records, so adding
 * a backend is a new reader rather than a branch in the routes or the client.
 */
export interface TraceReader {
  /** Whether a trace may exist; must not call the tracing backend's read API. */
  isAvailable(query: TraceQuery): Promise<boolean>;
  listRecords(query: TraceQuery & { cursor?: string }): Promise<TTracePage>;
  /** `null` when the record is absent or outside the conversation's traces. */
  getRecord(query: TraceQuery & { recordId: string }): Promise<TTraceRecordDetail | null>;
}

export class TraceReadError extends Error {
  readonly code: TTraceErrorCode;

  constructor(code: TTraceErrorCode, message: string) {
    super(message);
    this.name = 'TraceReadError';
    this.code = code;
  }
}
