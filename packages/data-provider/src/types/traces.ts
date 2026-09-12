/**
 * Provider-neutral conversation trace contract. The server maps whatever its
 * tracing backend stores into these shapes, so the client never sees a
 * backend's field names, credentials, URL structure or API version.
 */

export type TTraceRecordKind = 'agent' | 'generation' | 'tool' | 'span' | 'event';

/** `running` marks a record with no end time yet; it has a start but no duration. */
export type TTraceStatus = 'ok' | 'warning' | 'error' | 'running';

export type TTraceUsage = {
  input?: number;
  output?: number;
  total?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
};

export type TTraceRecord = {
  id: string;
  traceId: string;
  /** The response message whose turn produced this record; groups records into turns. */
  messageId: string;
  /** `null` for a root; may name a record that is not loaded (or does not exist). */
  parentId: string | null;
  kind: TTraceRecordKind;
  name: string;
  model?: string;
  /** ISO-8601 timestamps. */
  startTime: string;
  endTime?: string;
  /** First streamed token of a generation; splits its span into TTFT and decoding. */
  completionStartTime?: string;
  status: TTraceStatus;
  statusMessage?: string;
  usage?: TTraceUsage;
  /** Total cost in USD, when the backend priced the record. */
  cost?: number;
};

export type TTraceErrorCode =
  | 'disabled'
  | 'not_found'
  | 'invalid_request'
  | 'rate_limited'
  | 'timeout'
  | 'unauthorized'
  | 'unsupported'
  | 'upstream_error';

export type TTraceErrorResponse = {
  error: string;
  errorCode: TTraceErrorCode;
};

export type TTraceAvailability = {
  available: boolean;
};

export type TTracePageParams = {
  conversationId: string;
  cursor?: string;
};

/** Newest records first; `nextCursor` loads the next older page. */
export type TTracePage = {
  records: TTraceRecord[];
  nextCursor?: string;
};

export type TTraceContent = {
  value: string;
  truncated: boolean;
};

export type TTraceRecordDetail = {
  record: TTraceRecord;
  /** False when the deployment withholds input, output and metadata. */
  contentAvailable: boolean;
  input?: TTraceContent;
  output?: TTraceContent;
  metadata?: TTraceContent;
};

export const TRACE_CURSOR_MAX_LENGTH = 4096;
export const TRACE_RECORD_ID_MAX_LENGTH = 256;
